// POST /api/v1/instructors/notes/:id/publish
//
// The Instructor's own "[Save for Students]" action (plans.txt §10) —
// previously console-only. Same effect as the console's `publish` action:
// sets publishedAt/publishedByStaffId, making the note visible to every
// paid + enrolled student in its course/semester automatically. Requires
// generation to have completed first, same rule as everywhere else this
// action exists.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { canManageCourse } from '$lib/server/access/course';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const note = await db.note.findUnique({
		where: { id: params.id },
		select: { id: true, courseId: true, semesterId: true, generatedAt: true }
	});
	if (!note) return API_ERRORS.notFound('Note');

	const canManage = await canManageCourse(locals.staff, note.courseId, note.semesterId);
	if (!canManage) return API_ERRORS.noAccess('note');

	if (!note.generatedAt) {
		return API_ERRORS.badRequest('Generate this note before saving it for students.');
	}

	await db.note.update({
		where: { id: note.id },
		data: { publishedAt: new Date(), publishedByStaffId: locals.staff.id }
	});

	return json({ published: true });
};
