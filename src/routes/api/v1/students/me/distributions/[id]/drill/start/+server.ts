// POST /api/v1/students/me/distributions/:id/drill/start
//
// NEW per BACKEND_HANDOFF(2).md §2.3 — makes GET /received-distributions'
// reveal gate real instead of cosmetic. Mirrors
// POST /assignments/:id/drill/start exactly, scoped to a distribution's
// question set instead of an Assignment's own: self-paced, no staff
// involvement, idempotent against an already-in-progress attempt,
// otherwise unlimited repeat attempts (see schema.prisma's
// DistributionDrillAttempt — no unique constraint, same as
// AssignmentDrillAttempt).
//
// Access: `:id` is the AssignmentDistributionRecipient row's
// distributionId — only a student who actually received this specific
// distribution may drill it. Not the same check as canAccessCourse; being
// a recipient IS the access grant here, same reasoning as
// GET /received-distributions itself.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const recipient = await db.assignmentDistributionRecipient.findUnique({
		where: { distributionId_studentId: { distributionId: params.id, studentId: locals.student.id } }
	});
	if (!recipient) return API_ERRORS.noAccess('distribution');

	const existing = await db.distributionDrillAttempt.findFirst({
		where: { studentId: locals.student.id, distributionId: params.id, finishedAt: null },
		orderBy: { startedAt: 'desc' }
	});
	if (existing) return json({ attemptId: existing.id, startedAt: existing.startedAt });

	const attempt = await db.distributionDrillAttempt.create({
		data: { studentId: locals.student.id, distributionId: params.id }
	});

	return json({ attemptId: attempt.id, startedAt: attempt.startedAt }, { status: 201 });
};
