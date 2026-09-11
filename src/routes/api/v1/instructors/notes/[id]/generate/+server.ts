// POST /api/v1/instructors/notes/:id/generate
//
// Added per plans.txt §10: the Instructor's own "[Generate Study
// Materials]" action, previously only available from the console
// (Admin/Moderator). Same synchronous pipeline, same runGeneration call —
// see lib/server/generation/generate.ts. Admin/Moderator retain their own
// equivalent console action (see console/notes/[id]/+page.server.ts's
// `generate` action) — this doesn't replace that, it adds the parity
// plans.txt §11 calls for.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { canManageCourse } from '$lib/server/access/course';
import { runGeneration } from '$lib/server/generation/generate';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const note = await db.note.findUnique({
		where: { id: params.id },
		select: { id: true, courseId: true, semesterId: true, uploadedByStaffId: true }
	});
	if (!note) return API_ERRORS.notFound('Note');

	const canManage = await canManageCourse(locals.staff, note.courseId, note.semesterId);
	if (!canManage) return API_ERRORS.noAccess('note');

	await runGeneration('NOTE', note.id);

	const updated = await db.note.findUnique({
		where: { id: note.id },
		select: { generatedAt: true, generationError: true }
	});

	if (updated?.generationError) return API_ERRORS.badRequest(updated.generationError);

	return json({ generated: true, generatedAt: updated?.generatedAt ?? null });
};
