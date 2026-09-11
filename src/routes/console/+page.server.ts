import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import { computeCourseEngagementCounts } from '$lib/server/analytics/courseProgress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdminOrModerator(locals.staff);

	const semester = await getActiveSemester();

	const [collegeCount, courseCount, studentCount, notes, assignments, courses] = await Promise.all([
		db.college.count(),
		db.course.count(),
		db.student.count({ where: { deletedAt: null } }),
		db.note.findMany({ where: { semesterId: semester.id }, select: { generatedAt: true, generationError: true } }),
		db.assignment.findMany({
			where: { semesterId: semester.id },
			select: { generatedAt: true, generationError: true }
		}),
		db.course.findMany({
			orderBy: { name: 'asc' },
			select: {
				id: true,
				name: true,
				courseCode: true,
				_count: {
					select: {
						notes: { where: { semesterId: semester.id } },
						assignments: { where: { semesterId: semester.id } }
					}
				}
			}
		})
	]);

	const generatedCount =
		notes.filter((n) => n.generatedAt).length + assignments.filter((a) => a.generatedAt).length;
	const failedCount =
		notes.filter((n) => n.generationError).length + assignments.filter((a) => a.generationError).length;
	const totalContent = notes.length + assignments.length;

	// Per-course engagement summary, for the active semester — cheap enough
	// at pilot scale to compute for every course on every dashboard load; if
	// this ever needs to scale up, this is the one query to optimize/cache
	// first.
	const courseEngagement = await Promise.all(
		courses.map(async (course) => ({
			course,
			engagement: await computeCourseEngagementCounts(course.id, semester.id)
		}))
	);

	return {
		semester: { id: semester.id, name: semester.name },
		stats: { collegeCount, courseCount, studentCount, totalContent, generatedCount, failedCount },
		courseEngagement
	};
};
