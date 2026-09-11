import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdminOrModerator(locals.staff);

	const notes = await db.note.findMany({
		orderBy: { createdAt: 'desc' },
		include: {
			course: { select: { name: true, courseCode: true } },
			uploadedBy: { select: { name: true, role: true } },
			_count: { select: { questionUnits: true } }
		}
	});

	return { notes };
};
