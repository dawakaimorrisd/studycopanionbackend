// POST /api/v1/study-sessions/start
//
// RESTORED — this endpoint was briefly removed and replaced with a
// batch/sync design, then reverted after confirming against the actual
// Frontend implementation (BACKEND_HANDOFF(2).md §2.2) that it kept this
// real-time Start/End pair for the online case. The activity-based
// tracking product decision (pause on ~45s inactivity or tab/app
// backgrounding, resume on next interaction) is implemented by calling
// this endpoint MORE OFTEN, in short bursts that match real contiguous
// engagement — each pause is a real `end` call, each resume is a real new
// `start` call — not by changing this endpoint's contract. See
// schema.prisma's StudySession comment for the full redesign history.
//
// NOTES ONLY, per direct product decision — Assignments are read as PDF
// (see pdfConversion.ts) and don't get this kind of engagement tracking.
//
// This is also the real replacement for the old NoteAccess/AssignmentAccess
// `openedAt` concept: whether a student has "opened" a note is simply
// "does at least one StudySession row exist for (studentId, noteId)."
//
// Returns a sessionId the Frontend holds in memory until the matching
// POST /study-sessions/:id/end call. A session that never gets an `end`
// call (tab closed, app killed, or the device goes offline mid-session —
// see /study-sessions/backfill for that specific case) simply stays
// durationSeconds: 0 forever — harmless for analytics, no cleanup job
// exists or is needed for it.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { canAccessCourse } from '$lib/server/access/course';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const startSchema = z.object({
	noteId: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const body = await request.json().catch(() => null);
	const parsed = startSchema.safeParse(body);
	if (!parsed.success) return API_ERRORS.badRequest(parsed.error.issues[0].message);

	const note = await db.note.findUnique({
		where: { id: parsed.data.noteId },
		select: { courseId: true, semesterId: true, chapterId: true }
	});
	if (!note) return API_ERRORS.notFound('Note');

	const eligible = await canAccessCourse(locals.student.id, note.courseId, note.semesterId);
	if (!eligible) return API_ERRORS.noAccess('note');

	const session = await db.studySession.create({
		data: {
			studentId: locals.student.id,
			semesterId: note.semesterId,
			courseId: note.courseId,
			chapterId: note.chapterId,
			noteId: parsed.data.noteId,
			durationSeconds: 0,
			endedAt: null
		}
	});

	return json({ sessionId: session.id, startedAt: session.startedAt }, { status: 201 });
};
