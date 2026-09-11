// GET /api/v1/instructors/me/analytics?period=today|week|month — the
// all-my-courses counterpart to the per-course endpoint. Restricted to
// courses this instructor is actually assigned to for the active
// semester — see computeCoursePeriodStats's comment on why that's the
// scoping mechanism, not just a filter.
import { json } from '@sveltejs/kit';
import { instructorCourseIds } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import { computeCoursePeriodStats, resolvePeriod } from '$lib/server/analytics/studyTime';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const semester = await getActiveSemester();
	const courseIds = await instructorCourseIds(locals.staff.id, semester.id);

	const periodParam = url.searchParams.get('period');
	const period = periodParam === 'today' || periodParam === 'month' ? periodParam : 'week';
	const range = resolvePeriod(period);

	const courses = await computeCoursePeriodStats(courseIds, semester.id, range);

	return json({
		semester: { id: semester.id, name: semester.name },
		period,
		courses
	});
};
