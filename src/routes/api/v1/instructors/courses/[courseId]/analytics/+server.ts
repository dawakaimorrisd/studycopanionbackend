// GET /api/v1/instructors/courses/:courseId/analytics?period=today|week|month
//
// CORRECTED per direct product clarification: chapter-level time-tracking
// breakdown was deliberately removed from this endpoint (and the console's
// matching UI) — a course's chapters ARE its notes ("Accounting212 is the
// course, the notes are the chapters"), so chapter-level *time* is nearly
// the same granularity as note-level and doesn't add a dashboard-worthy
// signal; chapter-level *accuracy* is already covered by test/drill scores
// (NoteTestAttempt), not time spent. What matters here is course-level
// engagement — is the student studying this course at all — not which
// specific chapter. See lib/server/analytics/studyTime.ts's
// computeChapterBreakdown/computeMostLeastStudiedChapter — left in place,
// unused by any dashboard, in case a genuinely different future need
// arises; this endpoint deliberately does not call them.
//
// `period` defaults to 'week'. Custom start/end isn't exposed here yet —
// resolvePeriod only handles the three named windows; add `?start=&end=`
// handling if/when a custom-range picker is actually built on the Frontend
// (flagged, not silently omitted).
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireInstructorCourseAccess } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import { resolvePeriod } from '$lib/server/analytics/studyTime';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const semester = await getActiveSemester();

	try {
		await requireInstructorCourseAccess(locals.staff, params.courseId, semester.id);
	} catch {
		return API_ERRORS.noAccess('course');
	}

	const periodParam = url.searchParams.get('period');
	const period = periodParam === 'today' || periodParam === 'month' ? periodParam : 'week';
	const range = resolvePeriod(period);

	const [totals, activeStudents] = await Promise.all([
		db.studySession.aggregate({
			where: { courseId: params.courseId, semesterId: semester.id, startedAt: { gte: range.start, lte: range.end } },
			_sum: { durationSeconds: true }
		}),
		db.studySession.findMany({
			where: { courseId: params.courseId, semesterId: semester.id, startedAt: { gte: range.start, lte: range.end } },
			select: { studentId: true },
			distinct: ['studentId']
		})
	]);

	return json({
		semester: { id: semester.id, name: semester.name },
		period,
		totalStudySeconds: totals._sum.durationSeconds ?? 0,
		activeStudentCount: activeStudents.length
	});
};
