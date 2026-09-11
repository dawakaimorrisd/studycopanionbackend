// GET /api/v1/instructors/courses/:courseId/content — Notes list for this
// course/semester. See the separate GET
// /instructors/courses/:courseId/assignments for the Assignment
// counterpart — kept as a distinct endpoint rather than merged into this
// one, matching Notes/Assignments being separate content types throughout
// this app.
//
// CORRECTED per plans.txt §25/§30 (see build-plan note on
// api/v1/assignments/[id]/+server.ts): Instructor DOES have full
// create/generate/publish/read involvement with Assignments in their own
// course — that comment here was stale, inherited from the Phase 0-9 rule
// this plan intentionally supersedes.
//
// Also CORRECTED: gate is now canManageCourse, not
// requireInstructorCourseAccess alone — the latter only checks course
// assignment, not paid InstructorSemesterAccess, which let an unpaid
// instructor still list content. See instructors/notes/+server.ts's
// matching fix.
//
// Phase 10+: scoped to the active semester — an instructor's course list
// here only ever shows the current semester's notes, never a prior one's.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { canManageCourse } from '$lib/server/access/course';
import { getActiveSemester } from '$lib/server/access/semester';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();

	const semester = await getActiveSemester();

	const canManage = await canManageCourse(locals.staff, params.courseId, semester.id);
	if (!canManage) return API_ERRORS.noAccess('course');

	const notes = await db.note.findMany({
		where: { courseId: params.courseId, semesterId: semester.id },
		select: {
			id: true,
			title: true,
			chapterLabel: true,
			createdAt: true,
			generatedAt: true,
			publishedAt: true,
			uploadedByStaffId: true,
			testStartedAt: true,
			testRevealedAt: true
		},
		orderBy: { createdAt: 'desc' }
	});

	return json({
		notes: notes.map((n) => ({
			id: n.id,
			title: n.title,
			chapterLabel: n.chapterLabel,
			createdAt: n.createdAt,
			generatedAt: n.generatedAt,
			publishedAt: n.publishedAt,
			uploadedByStaffId: n.uploadedByStaffId,
			test: { started: Boolean(n.testStartedAt), revealed: Boolean(n.testRevealedAt) }
		}))
	});
};
