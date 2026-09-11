// POST /api/v1/study-sessions/:id/end
//
// RESTORED — see start/+server.ts's comment for the full context. Closes a
// session started by POST /study-sessions/start. Duration is computed
// SERVER-SIDE from startedAt to now — never trusts a client-reported
// elapsed time. Idempotent: ending an already-ended session just returns
// its existing (unchanged) duration rather than erroring, so a rapid
// pause/resume cycle (this endpoint is now called far more often than
// once-per-page-visit, per the activity-based tracking model) can't cause
// harm from a double-fire.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const session = await db.studySession.findUnique({
		where: { id: params.id },
		select: { id: true, studentId: true, startedAt: true, endedAt: true, durationSeconds: true }
	});
	if (!session) return API_ERRORS.notFound('Study session');
	if (session.studentId !== locals.student.id) return API_ERRORS.noAccess('study session');

	if (session.endedAt) {
		// Already ended — return what's there rather than erroring (see
		// file-top comment on why this is deliberately idempotent).
		return json({ sessionId: session.id, durationSeconds: session.durationSeconds, endedAt: session.endedAt });
	}

	const endedAt = new Date();
	const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000));

	await db.studySession.update({
		where: { id: session.id },
		data: { endedAt, durationSeconds }
	});

	return json({ sessionId: session.id, durationSeconds, endedAt });
};
