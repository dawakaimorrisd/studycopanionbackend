import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import { computeCollegeCourseSummaries } from '$lib/server/analytics/courseProgress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

	const college = await db.college.findUnique({
		where: { id: params.collegeId },
		select: { id: true, name: true }
	});
	if (!college) throw error(404, 'College not found.');

	const semester = await getActiveSemester();
	const courseSummaries = await computeCollegeCourseSummaries(params.collegeId, semester.id);

	return { college, semester: { id: semester.id, name: semester.name }, courseSummaries };
};
