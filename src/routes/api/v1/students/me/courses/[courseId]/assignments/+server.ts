
// POST /api/v1/students/me/courses/:courseId/assignments
//
// Assignment creation endpoint.
//
// A student's first upload creates the Assignment record. There is no
// staff-authored assignment prompt to submit against.
//
// IMPORTANT PROCESSING ARCHITECTURE:
// - The uploaded DOCX/PDF is stored as the ORIGINAL/CANONICAL file.
// - No text extraction happens during this request.
// - No DOCX -> PDF conversion happens during this request.
// - The request creates the Assignment and queues background processing.
// - Redis/BullMQ worker later:
//     1. Converts DOCX -> PDF while preserving document formatting.
//     2. Keeps an uploaded PDF as the PDF source.
//     3. Extracts text from the original DOCX/PDF for AI.
//     4. Updates the Assignment with rawText/pdfUrl/status fields.
//
// Returns BOTH `assignmentId` and `submissionId` with the SAME value.
// Assignment and Submission are one record now.
//
// There is no publish step — the Assignment is visible to whoever can
// manage the course (Instructor/Admin/Moderator, read-only) once created.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { canAccessCourse } from '$lib/server/access/course';
import { canReceiveDistribution } from '$lib/server/access/assignment';
import { getActiveSemester } from '$lib/server/access/semester';
import {
	resolveSubmissionFile,
	SubmissionUploadError
} from '$lib/server/submissionUpload';
import { enqueueAssignmentProcessing } from '$lib/server/jobs/queue';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const typeSchema = z.enum(['INDIVIDUAL', 'GROUP']);

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const semester = await getActiveSemester();

	const eligible = await canAccessCourse(
		locals.student.id,
		params.courseId,
		semester.id
	);

	if (!eligible) return API_ERRORS.noAccess('course');

	const formData = await request.formData();

	const title = formData.get('title');

	const typeParsed = typeSchema.safeParse(formData.get('type'));

	if (!typeParsed.success) {
		return API_ERRORS.badRequest('type must be INDIVIDUAL or GROUP.');
	}

	let groupName: string | null = null;
	let memberIds: string[] = [];

	if (typeParsed.data === 'GROUP') {
		const groupNameRaw = formData.get('groupName');

		groupName =
			typeof groupNameRaw === 'string' && groupNameRaw.trim()
				? groupNameRaw.trim()
				: null;

		if (!groupName) {
			return API_ERRORS.badRequest(
				'groupName is required for a group assignment.'
			);
		}

		memberIds = formData
			.getAll('memberStudentIds')
			.map(String)
			.filter(Boolean);

		// Re-validate every member server-side — never trust a client-built
		// list from an earlier GET /eligible-group-members fetch, since the
		// two requests aren't atomic.
		for (const memberId of memberIds) {
			if (memberId === locals.student.id) {
				return API_ERRORS.badRequest(
					"Don't include yourself in memberStudentIds — you're the submitter."
				);
			}

			const memberEligible = await canReceiveDistribution(
				memberId,
				params.courseId,
				semester.id
			);

			if (!memberEligible) {
				return API_ERRORS.badRequest(
					'One or more selected members are not eligible for this course.'
				);
			}
		}
	}

	/*
	 * Upload-only stage.
	 *
	 * resolveSubmissionFile() now:
	 * - validates the uploaded file
	 * - reads the file
	 * - stores the ORIGINAL file
	 *
	 * It does NOT:
	 * - extract rawText
	 * - convert DOCX -> PDF
	 * - generate pdfUrl
	 *
	 * Those operations happen in the background worker.
	 */
	let file;

	try {
		file = await resolveSubmissionFile(formData);
	} catch (err) {
		if (err instanceof SubmissionUploadError) {
			return API_ERRORS.badRequest(err.message);
		}

		throw err;
	}

	/*
	 * Create the Assignment and its group members together.
	 *
	 * The original uploaded file is the canonical source.
	 */
	const assignment = await db.$transaction(async (tx) => {
		const created = await tx.assignment.create({
			data: {
				courseId: params.courseId,
				semesterId: semester.id,
				submittedById: locals.student!.id,
				type: typeParsed.data,
				groupName,
				title:
					typeof title === 'string' && title.trim()
						? title.trim()
						: null,

				// ORIGINAL/CANONICAL UPLOAD
				fileUrl: file.fileUrl,
				fileName: file.fileName,
				fileMimeType: file.fileMimeType
			}
		});

		if (memberIds.length > 0) {
			await tx.assignmentMember.createMany({
				data: memberIds.map((studentId) => ({
					assignmentId: created.id,
					studentId
				}))
			});
		}

		return created;
	});

	/*
	 * Queue the expensive processing AFTER the Assignment exists.
	 *
	 * The worker will later:
	 * - convert DOCX -> PDF
	 * - extract rawText from the ORIGINAL file
	 * - save pdfUrl
	 * - update processing information
	 */
	await enqueueAssignmentProcessing(assignment.id);

	/*
	 * Return immediately.
	 *
	 * 202 = accepted for background processing.
	 */
	return json(
		{
			assignmentId: assignment.id,
			submissionId: assignment.id,
			title: assignment.title,
			type: assignment.type,
			queued: true
		},
		{ status: 202 }
	);
};

