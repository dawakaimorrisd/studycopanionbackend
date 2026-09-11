// POST /api/v1/students/me/courses/:courseId/assignments
//
// NEW — per Frontend Handoff v3's blocking item. This is THE creation
// endpoint for an Assignment now: there is no staff-authored prompt to
// submit against anymore (see schema.prisma's Assignment comment) —
// "nobody pre-creates an assignment record — not Instructor, not Admin
// either. A student's first upload creates it." A student picks a
// course, describes what they're turning in, uploads it — that single
// action creates the whole record in one transaction. There is no
// "browse assignments and submit to one" flow; this replaces the old
// nested POST /students/me/assignments/:id/submission entirely (that
// endpoint required an assignment to already exist, which no longer
// makes sense).
//
// Returns BOTH `assignmentId` and `submissionId` in the response, with
// the SAME value — Assignment and Submission are one record now, but
// every downstream endpoint (POST .../generate, GET .../eligible-recipients,
// POST .../distribute, GET /received-distributions) was built and is
// already deployed keyed on "my submission's id." Returning both names
// means existing call sites don't need to change, while new code reading
// this response can use whichever name makes sense in context.
//
// Same extraction + PDF-conversion pipeline as everywhere else this file
// type is handled (see submissionUpload.ts / pdfConversion.ts). No
// publish step — visible to whoever can manage the course
// (Instructor/Admin/Moderator, read-only) the instant it's created.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { canAccessCourse } from '$lib/server/access/course';
import { canReceiveDistribution } from '$lib/server/access/assignment';
import { getActiveSemester } from '$lib/server/access/semester';
import { resolveSubmissionFile, SubmissionUploadError } from '$lib/server/submissionUpload';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const typeSchema = z.enum(['INDIVIDUAL', 'GROUP']);

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const semester = await getActiveSemester();

	const eligible = await canAccessCourse(locals.student.id, params.courseId, semester.id);
	if (!eligible) return API_ERRORS.noAccess('course');

	const formData = await request.formData();
	const title = formData.get('title');
	const typeParsed = typeSchema.safeParse(formData.get('type'));
	if (!typeParsed.success) return API_ERRORS.badRequest('type must be INDIVIDUAL or GROUP.');

	let groupName: string | null = null;
	let memberIds: string[] = [];

	if (typeParsed.data === 'GROUP') {
		const groupNameRaw = formData.get('groupName');
		groupName = typeof groupNameRaw === 'string' && groupNameRaw.trim() ? groupNameRaw.trim() : null;
		if (!groupName) return API_ERRORS.badRequest('groupName is required for a group assignment.');

		memberIds = formData.getAll('memberStudentIds').map(String).filter(Boolean);

		// Re-validate every member server-side — never trust a client-built
		// list from an earlier GET /eligible-group-members fetch, since the
		// two requests aren't atomic.
		for (const memberId of memberIds) {
			if (memberId === locals.student.id) {
				return API_ERRORS.badRequest("Don't include yourself in memberStudentIds — you're the submitter.");
			}
			const memberEligible = await canReceiveDistribution(memberId, params.courseId, semester.id);
			if (!memberEligible) {
				return API_ERRORS.badRequest('One or more selected members are not eligible for this course.');
			}
		}
	}

	let file;
	try {
		file = await resolveSubmissionFile(formData);
	} catch (err) {
		if (err instanceof SubmissionUploadError) return API_ERRORS.badRequest(err.message);
		throw err;
	}

	const assignment = await db.$transaction(async (tx) => {
		const created = await tx.assignment.create({
			data: {
				courseId: params.courseId,
				semesterId: semester.id,
				submittedById: locals.student!.id,
				type: typeParsed.data,
				groupName,
				title: typeof title === 'string' && title.trim() ? title.trim() : null,
				fileUrl: file.fileUrl,
				fileName: file.fileName,
				fileMimeType: file.fileMimeType,
				rawText: file.rawText,
				pdfUrl: file.pdfUrl,
				pdfConversionError: file.pdfConversionError
			}
		});

		if (memberIds.length > 0) {
			await tx.assignmentMember.createMany({
				data: memberIds.map((studentId) => ({ assignmentId: created.id, studentId }))
			});
		}

		return created;
	});

	return json(
		{
			assignmentId: assignment.id,
			submissionId: assignment.id,
			title: assignment.title,
			type: assignment.type,
			pdfUrl: assignment.pdfUrl,
			pdfConversionError: assignment.pdfConversionError
		},
		{ status: 201 }
	);
};
