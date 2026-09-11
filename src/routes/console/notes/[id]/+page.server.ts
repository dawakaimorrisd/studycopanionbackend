import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { runGeneration } from '$lib/server/generation/generate';
import { config } from '$lib/server/env';
import { eligibleStudentsForCourse } from '$lib/server/access/course';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

	const note = await db.note.findUnique({
		where: { id: params.id },
		include: {
			course: {
				select: {
					name: true,
					courseCode: true,
					colleges: { select: { collegeId: true } }
				}
			},
			chapter: { select: { id: true, title: true } },
			uploadedBy: { select: { name: true, role: true } },
			publishedBy: { select: { name: true } },
			questionUnits: { orderBy: { order: 'asc' }, include: { dictionaryEntries: true } },
			testAttempts: { select: { id: true, studentId: true, score: true } }
		}
	});

	if (!note) throw error(404, 'Note not found.');

	const chapters = await db.courseChapter.findMany({
		where: { courseId: note.courseId, semesterId: note.semesterId },
		orderBy: { order: 'asc' },
		select: { id: true, title: true }
	});

	// Phase 10+: this used to render note.grantedTo (NoteAccess grant rows —
	// removed). Every paid + enrolled student in this note's course/semester
	// is now automatically eligible once the note is published; this list is
	// what "Save for Students" makes visible, not something staff picks.
	const eligibleStudents = await eligibleStudentsForCourse(note.courseId, note.semesterId);

	return { note, chapters, eligibleStudents, groqKeyOptions: config.groqApiKeyOptions.map((o) => o.label) };
};

export const actions: Actions = {
	generate: async ({ request, locals, params }) => {
		requireAdminOrModerator(locals.staff);

		// An optional Groq key picker — see generate.ts's forceGroqKeyLabel.
		// Empty/unset means the default/first-configured key.
		const formData = await request.formData();
		const groqKey = String(formData.get('groqKey') ?? '').trim();

		// Synchronous, per the plan — this request blocks until the chosen
		// provider(s) return. runGeneration never throws; failures land in
		// Note.generationError, which the page below renders.
		await runGeneration('NOTE', params.id, groqKey ? { forceGroqKeyLabel: groqKey } : {});

		return { generated: true };
	},

	// v9 amendment: some uploads come through with messy extracted text
	// (inconsistent spacing/line breaks from a rough-quality source PDF, for
	// instance) — rather than trying to auto-fix formatting (there's nothing
	// to detect in plain extracted text — see PHASE_9.md's amendment on why
	// the earlier font-forcing approach was abandoned), staff can just edit
	// it directly here. Whatever's saved is exactly what every reader (API,
	// Frontend, console) sees afterward — no display-layer transformation
	// anywhere. Doesn't touch generatedAt/existing QuestionUnits — if the
	// edit is substantial enough to need it, click Regenerate separately.
	editText: async ({ request, locals, params }) => {
		requireAdminOrModerator(locals.staff);
		const formData = await request.formData();
		const rawText = String(formData.get('rawText') ?? '');
		if (!rawText.trim()) {
			return fail(400, { error: 'Content cannot be empty.' });
		}

		await db.note.update({ where: { id: params.id }, data: { rawText } });
		return { textEdited: true };
	},
	// v9 amendment: not every Instructor will have the time or inclination
	// to run the pre-test cycle themselves for every chapter — the dean's
	// own reasoning was that a chapter without a pre-test run at all would
	// otherwise leave its Assignment-style drill inaccessible to students.
	// Admin/Moderator get the exact same two actions an Instructor has, plus
	// a third one an Instructor doesn't: a full override. These three mirror
	// (and share the same underlying fields as) POST /notes/:id/test/start,
	// /test/done on the Instructor-facing API — but that API route itself
	// stays Instructor-only; these are separate console-side actions using
	// direct Prisma, matching how every other console mutation in this app
	// works (see BACKEND_BUILD_PLAN.md §3 — the console never calls its own
	// API internally).
	startTest: async ({ locals, params }) => {
		requireAdminOrModerator(locals.staff);
		await db.note.updateMany({
			where: { id: params.id, testStartedAt: null },
			data: { testStartedAt: new Date() }
		});
		return { testStarted: true };
	},

	endTest: async ({ locals, params }) => {
		requireAdminOrModerator(locals.staff);

		const note = await db.note.findUnique({ where: { id: params.id }, select: { testStartedAt: true } });
		if (!note?.testStartedAt) {
			return fail(400, { error: "This chapter's pre-test hasn't been started yet." });
		}

		await db.note.updateMany({
			where: { id: params.id, testRevealedAt: null },
			data: { testRevealedAt: new Date() }
		});
		return { testEnded: true };
	},

	// The override: skip the whole start → students take it → end cycle and
	// just show every sent student the questions AND answers directly, as
	// pure study material. This needs no new field or gating logic — the
	// existing GET /notes/:id behavior already does exactly this the moment
	// BOTH timestamps are set, whether or not any NoteTestAttempt exists.
	// Setting both at once here in a single click is the entire feature.
	overrideReveal: async ({ locals, params }) => {
		requireAdminOrModerator(locals.staff);
		const now = new Date();
		await db.note.update({
			where: { id: params.id },
			data: { testStartedAt: now, testRevealedAt: now }
		});
		return { overridden: true };
	},

	// Phase 12: "Save for Students" — replaces the old per-student Send flow
	// entirely. There is no recipient picker: publishing makes the note
	// visible to every currently paid + enrolled student in its course/
	// semester at once, automatically, from then on (including students
	// enrolled later, until Phase 17's rollover moves them to a new
	// semester). Requires generation to have completed first — publishing
	// ungenerated content makes no sense.
	publish: async ({ locals, params }) => {
		const staff = requireAdminOrModerator(locals.staff);

		const note = await db.note.findUnique({ where: { id: params.id }, select: { generatedAt: true } });
		if (!note?.generatedAt) {
			return fail(400, { error: 'Generate this note before saving it for students.' });
		}

		await db.note.update({
			where: { id: params.id },
			data: { publishedAt: new Date(), publishedByStaffId: staff.id }
		});
		return { published: true };
	},

	unpublish: async ({ locals, params }) => {
		requireAdminOrModerator(locals.staff);
		await db.note.update({
			where: { id: params.id },
			data: { publishedAt: null, publishedByStaffId: null }
		});
		return { unpublished: true };
	},

	// Phase 12: assign/change this note's chapter, or clear it (a
	// chapter-less note is valid — see schema.prisma's nullable chapterId).
	setChapter: async ({ request, locals, params }) => {
		requireAdminOrModerator(locals.staff);
		const formData = await request.formData();
		const chapterId = String(formData.get('chapterId') ?? '');

		await db.note.update({
			where: { id: params.id },
			data: { chapterId: chapterId || null }
		});
		return { chapterSet: true };
	}
};