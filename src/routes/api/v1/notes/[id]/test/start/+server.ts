// POST /api/v1/notes/:id/test/start — Instructor-only.
//
// Starts/sparks the chapter test by setting Note.testStartedAt.
//
// This is the single switch that makes the question text and options
// visible to students through GET /api/v1/notes/:id.
//
// Rules:
//   - Instructor only.
//   - Instructor must be assigned to the note's course.
//   - Idempotent: starting an already-started test is a no-op.
//   - Starting the test does NOT reveal correct answers.
//   - testRevealedAt remains unchanged here.
//
// Dictionary entries are NOT controlled by this endpoint. They remain
// visible to students regardless of whether the test has started.

import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireInstructorCourseAccess } from '$lib/server/auth/permissions';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	/*
	 * ------------------------------------------------------------
	 * AUTHENTICATION / ROLE
	 * ------------------------------------------------------------
	 */

	if (!locals.staff) {
		return API_ERRORS.notAuthenticated();
	}

	if (locals.staff.role !== 'INSTRUCTOR') {
		return API_ERRORS.notAnInstructor();
	}

	/*
	 * ------------------------------------------------------------
	 * FIND NOTE
	 * ------------------------------------------------------------
	 */

	const note = await db.note.findUnique({
		where: { id: params.id },
		select: {
			id: true,
			courseId: true,
			semesterId: true,
			testStartedAt: true,
			testRevealedAt: true
		}
	});

	if (!note) {
		return API_ERRORS.notFound('Note');
	}

	/*
	 * ------------------------------------------------------------
	 * COURSE ACCESS
	 * ------------------------------------------------------------
	 *
	 * The instructor can only start tests for notes belonging
	 * to courses they are assigned to.
	 */

	try {
		await requireInstructorCourseAccess(locals.staff, note.courseId, note.semesterId);
	} catch {
		return API_ERRORS.noAccess('note');
	}

	/*
	 * ------------------------------------------------------------
	 * IDEMPOTENT START
	 * ------------------------------------------------------------
	 *
	 * If the test has already been started, do nothing.
	 *
	 * This makes repeatedly clicking the Start button safe.
	 */

	if (note.testStartedAt) {
		return json({
			started: true
		});
	}

	/*
	 * ------------------------------------------------------------
	 * START TEST
	 * ------------------------------------------------------------
	 *
	 * Setting testStartedAt is what the student GET endpoint checks:
	 *
	 *     Boolean(note.testStartedAt)
	 *
	 * Once this is set:
	 *
	 *   - students can see question text
	 *   - students can see options
	 *   - dictionary remains visible
	 *   - correct answers remain hidden
	 *   - explanations remain hidden
	 *   - student scores remain hidden
	 */

	await db.note.update({
		where: { id: note.id },
		data: {
			testStartedAt: new Date()
		}
	});

	return json({
		started: true
	});
};

