// v9 amendment: "we need a page for admin to track student progress
// across colleges... to strengthen our marketing next semester." This is
// the top of that — global totals, then every College, each linking down
// to its courses (college/[collegeId]), each course linking down to the
// existing full per-student detail page (progress/[courseId], Phase 7).
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import { computeGlobalProgressOverview } from '$lib/server/analytics/courseProgress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdminOrModerator(locals.staff);

	const semester = await getActiveSemester();

	const [overview, colleges] = await Promise.all([
		computeGlobalProgressOverview(semester.id),
		db.college.findMany({
			orderBy: { name: 'asc' },
			select: { id: true, name: true, _count: { select: { students: true } } }
		})
	]);

	return { semester: { id: semester.id, name: semester.name }, overview, colleges };
};
