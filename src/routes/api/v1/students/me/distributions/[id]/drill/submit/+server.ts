// POST /api/v1/students/me/distributions/:id/drill/submit
//
// NEW per BACKEND_HANDOFF(2).md §2.3. Mirrors
// POST /assignments/:id/drill/submit exactly — finishes the current
// in-progress attempt (from drill/start) and returns the full result
// immediately (correctOption, explanation, per-answer correctness,
// score). Once this call succeeds, GET /received-distributions will
// report this distribution as revealed (gated on the most recent
// attempt's finishedAt, same rule as an Assignment's own drill).
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
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

	const recipient = await db.assignmentDistributionRecipient.findUnique({
		where: { distributionId_studentId: { distributionId: params.id, studentId: locals.student.id } },
		select: {
			distribution: {
				select: {
					assignment: {
						select: {
							questionUnits: { select: { id: true, correctOption: true, explanation: true } }
						}
					}
				}
			}
		}
	});
	if (!recipient) return API_ERRORS.noAccess('distribution');

	const attempt = await db.distributionDrillAttempt.findFirst({
		where: { studentId: locals.student.id, distributionId: params.id, finishedAt: null },
		orderBy: { startedAt: 'desc' }
	});
	if (!attempt) {
		return API_ERRORS.badRequest('No drill in progress — call drill/start first.');
	}

	// Same integrity checks as Assignment/Note drill submit: every answer
	// must reference a real question unit on this distribution's
	// underlying assignment, no duplicates.
	const correctByQuestionId = new Map(
		recipient.distribution.assignment.questionUnits.map((qu) => [qu.id, qu.correctOption])
	);
	for (const a of parsed.data.answers) {
		if (!correctByQuestionId.has(a.questionUnitId)) {
			return API_ERRORS.badRequest(`Question unit ${a.questionUnitId} does not belong to this distribution.`);
		}
	}
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

	await db.distributionDrillAttempt.update({
		where: { id: attempt.id },
		data: {
			finishedAt: new Date(),
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

	const explanationByQuestionId = new Map(
		recipient.distribution.assignment.questionUnits.map((qu) => [qu.id, qu.explanation])
	);

	return json({
		finished: true,
		score,
		totalQuestions: parsed.data.answers.length,
		answers: parsed.data.answers.map((a) => ({
			questionUnitId: a.questionUnitId,
			selectedOption: a.selectedOption,
			correctOption: correctByQuestionId.get(a.questionUnitId),
			isCorrect: correctByQuestionId.get(a.questionUnitId) === a.selectedOption,
			explanation: explanationByQuestionId.get(a.questionUnitId) ?? null
		}))
	});
};
