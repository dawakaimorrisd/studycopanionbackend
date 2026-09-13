// POST /api/v1/instructors/notes — multipart/form-data, same shape as the
// console's upload form (courseId, title?, pastedText OR file). Write-once:
// there is deliberately no PATCH/PUT here or anywhere else for Instructor —
// see build plan §2/§6. A Moderator/Admin fixes mistakes from the console;
// an Instructor who needs a fix re-uploads as a new record.
//
// Phase 10+: content is always created for the active semester — there is
// no semester picker on this endpoint, matching PHASE_10_PLUS_BUILD_PLAN.md
// Phase 12's "content is always created for whatever semester is currently
// active" rule.
//
// CORRECTED: this used to gate on requireInstructorCourseAccess alone,
// which only checks course assignment — NOT paid InstructorSemesterAccess.
// That meant an instructor whose access had lapsed could still upload
// content, undermining the entire point of Phase 11's monetization gate.
// Now uses canManageCourse, which checks both.
//
// BACKGROUND PROCESSING:
// The request only validates/stores the content and creates the Note.
// Text extraction and AI generation are handled by the Redis/BullMQ worker.
// Notes do NOT go through PDF conversion.

import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { canManageCourse } from '$lib/server/access/course';
import { getActiveSemester } from '$lib/server/access/semester';
import {
	resolveUploadedContent,
	ContentUploadError
} from '$lib/server/contentUpload';
import {
	enqueueNoteProcessing
} from '$lib/server/jobs/queue';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({
	request,
	locals
}) => {
	if (!locals.staff) {
		return API_ERRORS.notAuthenticated();
	}

	if (locals.staff.role !== 'INSTRUCTOR') {
		return API_ERRORS.notAnInstructor();
	}

	const formData = await request.formData();

	const courseId = String(
		formData.get('courseId') ?? ''
	);

	const title = formData.get('title');
	const chapterLabel = formData.get('chapterLabel');
	const chapterId = formData.get('chapterId');

	if (!courseId) {
		return API_ERRORS.badRequest(
			'courseId is required.'
		);
	}

	const semester = await getActiveSemester();

	const canManage = await canManageCourse(
		locals.staff,
		courseId,
		semester.id
	);

	if (!canManage) {
		return API_ERRORS.noAccess('course');
	}

	let content;

	try {
		content = await resolveUploadedContent(
			formData
		);
	} catch (err) {
		if (err instanceof ContentUploadError) {
			return API_ERRORS.badRequest(err.message);
		}

		throw err;
	}

	const note = await db.note.create({
		data: {
			courseId,
			semesterId: semester.id,

			chapterId:
				typeof chapterId === 'string' &&
				chapterId.trim()
					? chapterId.trim()
					: null,

			title:
				typeof title === 'string' &&
				title.trim()
					? title.trim()
					: null,

			chapterLabel:
				typeof chapterLabel === 'string' &&
				chapterLabel.trim()
					? chapterLabel.trim()
					: null,

			rawText: content.rawText,

			sourceFileUrl:
				content.sourceFileUrl,

			sourceFileName:
				content.sourceFileName,

			sourceFileMimeType:
				content.sourceFileMimeType,

			uploadedByStaffId:
				locals.staff.id
		}
	});

	/*
	 * Do not extract text or generate AI content here.
	 *
	 * The Note has now been created and the request can return.
	 * The worker will:
	 *
	 *   uploaded file → extract text → save rawText → AI generation
	 *
	 * or, for pasted text:
	 *
	 *   existing rawText → AI generation
	 */
	await enqueueNoteProcessing(note.id);

	return json(
		{
			id: note.id,
			queued: true
		},
		{
			status: 202
		}
	);
};