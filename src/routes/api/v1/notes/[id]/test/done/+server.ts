// POST /api/v1/notes/:id/test/done — Instructor-only. Sets
// Note.testRevealedAt, which is the single switch that makes correctOption,
// explanation, and every attempted student's score visible at once (see
// GET /api/v1/notes/:id). Per the dean's Phase 9 direction: this exists
// specifically so a student can't see the answer right after submitting and
// pass it to a friend still taking the test — reveal is deliberately a
// batch action for the whole chapter, not per-student.
//
// Requires the test to have been started first — revealing a test that was
// never opened for submissions doesn't make sense and likely means the
// instructor meant to hit /test/start.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireInstructorCourseAccess } from '$lib/server/auth/permissions';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const note = await db.note.findUnique({
		where: { id: params.id },
		select: { id: true, courseId: true, semesterId: true, testStartedAt: true, testRevealedAt: true }
	});
	if (!note) return API_ERRORS.notFound('Note');

	try {
		await requireInstructorCourseAccess(locals.staff, note.courseId, note.semesterId);
	} catch {
		return API_ERRORS.noAccess('note');
	}

	if (!note.testStartedAt) {
		return API_ERRORS.badRequest('This chapter\'s test has not been started yet.');
	}

	if (!note.testRevealedAt) {
		await db.note.update({ where: { id: note.id }, data: { testRevealedAt: new Date() } });
	}

	return json({ revealed: true });
};
