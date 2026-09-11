// REDESIGNED for the unified, student-originated Assignment model —
// read-only, same as everywhere else Admin/Moderator touches Assignment
// now. No creation, no generate/publish action, no `uploadedBy` (nothing
// staff-authored to attribute) — this lists what students have submitted,
// across every course, most recent first.
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdminOrModerator(locals.staff);

	const assignments = await db.assignment.findMany({
		orderBy: { submittedAt: 'desc' },
		include: {
			course: { select: { name: true, courseCode: true } },
			submittedBy: { select: { name: true, studentCode: true } },
			_count: { select: { questionUnits: true, members: true } }
		}
	});

	return { assignments };
};
