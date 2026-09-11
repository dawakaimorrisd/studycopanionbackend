// REDESIGNED for the unified, student-originated Assignment model —
// read-only, no actions at all. Admin/Moderator never create, edit,
// generate, or publish an Assignment; the record is entirely student-
// authored (see schema.prisma's Assignment comment). This page is purely
// a viewer: the file (as PDF), whoever submitted it (+ group members if
// any), and whatever study material they generated from it, if it's a
// GROUP assignment and they chose to.
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

	const assignment = await db.assignment.findUnique({
		where: { id: params.id },
		include: {
			course: { select: { name: true, courseCode: true } },
			submittedBy: { select: { id: true, name: true, studentCode: true } },
			members: { include: { student: { select: { id: true, name: true, studentCode: true } } } },
			questionUnits: { orderBy: { order: 'asc' }, include: { dictionaryEntries: true } }
		}
	});

	if (!assignment) throw error(404, 'Assignment not found.');

	return { assignment };
};
