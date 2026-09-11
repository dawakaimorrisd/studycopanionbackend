// POST /api/v1/notes/:id/test/submit — Student-only. Submits every answer
// for a Note's chapter test in one shot and scores it server-side. Per
// Phase 9: one attempt only, ever (enforced by the unique(studentId, noteId)
// constraint on NoteTestAttempt, not just an app-level check) — there is no
// retake path. The response deliberately never includes correctOption,
// per-question correctness, or the score itself — see Note.testRevealedAt
// and GET /api/v1/notes/:id. A student who just submitted only learns that
// it was recorded, nothing about how they did, until their instructor
// reveals results for the whole chapter at once.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { canAccessCourse } from '$lib/server/access/course';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const submitSchema = z.object({
	answers: z
		.array(
			z.object({
				questionUnitId: z.string().min(1),
				selectedOption: z.enum(['A', 'B', 'C', 'D'])
			})
		)
		.min(1, 'Provide at least one answer.')
});

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const body = await request.json().catch(() => null);
	const parsed = submitSchema.safeParse(body);
	if (!parsed.success) return API_ERRORS.badRequest(parsed.error.issues[0].message);

	const note = await db.note.findUnique({
		where: { id: params.id },
		select: {
			id: true,
			courseId: true,
			semesterId: true,
			testStartedAt: true,
			questionUnits: { select: { id: true, correctOption: true } }
		}
	});
	if (!note) return API_ERRORS.notFound('Note');

	const eligible = await canAccessCourse(locals.student.id, note.courseId, note.semesterId);
	if (!eligible) return API_ERRORS.noAccess('note');

	if (!note.testStartedAt) {
		return API_ERRORS.badRequest('This chapter\'s test has not been started yet.');
	}

	const existing = await db.noteTestAttempt.findUnique({
		where: { studentId_noteId: { studentId: locals.student.id, noteId: note.id } }
	});
	if (existing) return API_ERRORS.conflict('You have already submitted this test.');

	// Every submitted answer must reference a real question unit on this
	// Note — reject rather than silently drop, so a client bug surfaces
	// immediately instead of producing a quietly wrong score.
	const correctByQuestionId = new Map(note.questionUnits.map((qu) => [qu.id, qu.correctOption]));
	for (const a of parsed.data.answers) {
		if (!correctByQuestionId.has(a.questionUnitId)) {
			return API_ERRORS.badRequest(`Question unit ${a.questionUnitId} does not belong to this note.`);
		}
	}
	// One answer per question unit — reject duplicates rather than silently
	// keeping the last one, for the same reason.
	const seen = new Set<string>();
	for (const a of parsed.data.answers) {
		if (seen.has(a.questionUnitId)) {
			return API_ERRORS.badRequest(`Duplicate answer for question unit ${a.questionUnitId}.`);
		}
		seen.add(a.questionUnitId);
	}

	const score = parsed.data.answers.filter(
		(a) => correctByQuestionId.get(a.questionUnitId) === a.selectedOption
	).length;

	try {
		await db.noteTestAttempt.create({
			data: {
				studentId: locals.student.id,
				noteId: note.id,
				score,
				answers: {
					create: parsed.data.answers.map((a) => ({
						questionUnitId: a.questionUnitId,
						selectedOption: a.selectedOption,
						isCorrect: correctByQuestionId.get(a.questionUnitId) === a.selectedOption
					}))
				}
			}
		});
	} catch {
		// Race: two submits for the same student+note landing concurrently —
		// the unique constraint is the real guard, this just gives a clean
		// error instead of a raw 500.
		return API_ERRORS.conflict('You have already submitted this test.');
	}

	return json({ submitted: true });
};
