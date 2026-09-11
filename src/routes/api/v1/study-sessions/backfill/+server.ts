// POST /api/v1/study-sessions/backfill
//
// NEW — per BACKEND_HANDOFF(2).md §2.2. Start/End Study (see start/,
// [id]/end/) are real-time-correlated by design: the server times the gap
// between the two calls itself. That model has no way to represent "the
// student was offline, so `start` never reached the server, but the
// Frontend still tracked N seconds of real activity locally." This
// endpoint is that one exception: a single already-computed duration,
// reported after the fact once connectivity returns.
//
// TRUST MODEL, stated plainly: `seconds` here is genuinely client-computed
// — there is no live session for the server to time, by definition (the
// student was offline). This is an accepted, unavoidable tradeoff for an
// inherently-offline scenario, not an oversight — the online path (start/
// end) remains fully server-timed and untrusted-by-design; this is the
// one deliberate exception. Clamped at MAX_BACKFILL_SECONDS regardless of
// what's reported, so one corrupted or malicious entry can't blow out a
// dashboard number the way an unbounded value could.
//
// Same idempotency spirit as end: safe to retry (e.g. a flaky reconnect
// that retries the same queued entry) — retries aren't deduplicated
// server-side (there's no client-supplied idempotency key to dedupe on),
// so the FRONTEND is responsible for only removing a queued entry from
// its local store after a confirmed 201, not before. Documented here
// rather than silently assumed.
//
// NOTES ONLY, same as start/end — no assignmentId path.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { canAccessCourse } from '$lib/server/access/course';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const MAX_BACKFILL_SECONDS = 6 * 60 * 60; // 6 hours — generous, but not unbounded

const backfillSchema = z.object({
	noteId: z.string().min(1),
	seconds: z.number().int().positive(),
	occurredAt: z.coerce.date()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const body = await request.json().catch(() => null);
	const parsed = backfillSchema.safeParse(body);
	if (!parsed.success) return API_ERRORS.badRequest(parsed.error.issues[0].message);

	const note = await db.note.findUnique({
		where: { id: parsed.data.noteId },
		select: { courseId: true, semesterId: true, chapterId: true }
	});
	if (!note) return API_ERRORS.notFound('Note');

	// Eligibility is checked at sync time, not at the time the offline
	// activity actually happened — a student whose access lapsed while
	// offline and before they reconnected will have this rejected. Rare
	// edge case, but real; the Frontend should treat a 403 here as
	// "drop this queued entry," not retry it forever.
	const eligible = await canAccessCourse(locals.student.id, note.courseId, note.semesterId);
	if (!eligible) return API_ERRORS.noAccess('note');

	const durationSeconds = Math.min(parsed.data.seconds, MAX_BACKFILL_SECONDS);
	const endedAt = parsed.data.occurredAt;
	const startedAt = new Date(endedAt.getTime() - durationSeconds * 1000);

	await db.studySession.create({
		data: {
			studentId: locals.student.id,
			semesterId: note.semesterId,
			courseId: note.courseId,
			chapterId: note.chapterId,
			noteId: parsed.data.noteId,
			startedAt,
			endedAt,
			durationSeconds
		}
	});

	return json({ durationSeconds }, { status: 201 });
};
