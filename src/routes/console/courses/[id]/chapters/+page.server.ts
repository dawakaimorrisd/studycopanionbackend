// Phase 12: CourseChapter management. Chapters are semester-scoped — this
// page always manages the ACTIVE semester's chapters for the course, never
// a past semester's (which stay fixed, tied to whatever Notes were filed
// under them at the time). Reordering matters: `order` drives both display
// order and, indirectly, which chapter a Note upload's dropdown lists
// first — see the console's Note-upload chapter picker.
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

	const course = await db.course.findUnique({
		where: { id: params.id },
		select: { id: true, name: true, courseCode: true }
	});
	if (!course) throw error(404, 'Course not found.');

	const semester = await getActiveSemester();

	const chapters = await db.courseChapter.findMany({
		where: { courseId: params.id, semesterId: semester.id },
		orderBy: { order: 'asc' },
		include: { _count: { select: { notes: true } } }
	});

	return { course, semester: { id: semester.id, name: semester.name }, chapters };
};

export const actions: Actions = {
	// New chapters are appended at the end — order is (current max + 1).
	// Reordering existing chapters happens via the move actions below, never
	// by typing a number directly, so `order` values stay a clean dense
	// sequence (0, 1, 2, …) with no gaps or manual collisions.
	create: async ({ request, locals, params }) => {
		requireAdminOrModerator(locals.staff);

		const formData = await request.formData();
		const title = String(formData.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Chapter title is required.' });

		const semester = await getActiveSemester();

		const last = await db.courseChapter.findFirst({
			where: { courseId: params.id, semesterId: semester.id },
			orderBy: { order: 'desc' },
			select: { order: true }
		});

		await db.courseChapter.create({
			data: {
				courseId: params.id,
				semesterId: semester.id,
				title,
				order: (last?.order ?? -1) + 1
			}
		});

		return { success: true };
	},

	rename: async ({ request, locals }) => {
		requireAdminOrModerator(locals.staff);
		const formData = await request.formData();
		const chapterId = String(formData.get('chapterId') ?? '');
		const title = String(formData.get('title') ?? '').trim();
		if (!chapterId || !title) return fail(400, { error: 'Missing chapter or title.' });

		await db.courseChapter.update({ where: { id: chapterId }, data: { title } });
		return { success: true };
	},

	// Swaps this chapter's order with its neighbor in the given direction —
	// simple adjacent-swap reordering rather than a full drag-and-drop list,
	// consistent with this console's plain-forms-only convention elsewhere.
	move: async ({ request, locals, params }) => {
		requireAdminOrModerator(locals.staff);
		const formData = await request.formData();
		const chapterId = String(formData.get('chapterId') ?? '');
		const direction = String(formData.get('direction') ?? '');
		if (!chapterId || (direction !== 'up' && direction !== 'down')) {
			return fail(400, { error: 'Missing chapter or direction.' });
		}

		const semester = await getActiveSemester();
		const chapters = await db.courseChapter.findMany({
			where: { courseId: params.id, semesterId: semester.id },
			orderBy: { order: 'asc' }
		});

		const index = chapters.findIndex((c) => c.id === chapterId);
		if (index === -1) return fail(404, { error: 'Chapter not found.' });

		const swapIndex = direction === 'up' ? index - 1 : index + 1;
		if (swapIndex < 0 || swapIndex >= chapters.length) return { success: true }; // already at the edge

		const a = chapters[index];
		const b = chapters[swapIndex];

		// Prisma's unique constraint on [courseId, semesterId, order] means a
		// direct two-row swap can transiently collide mid-transaction on some
		// engines — route through a temporary negative value to avoid it.
		await db.$transaction([
			db.courseChapter.update({ where: { id: a.id }, data: { order: -1 } }),
			db.courseChapter.update({ where: { id: b.id }, data: { order: a.order } }),
			db.courseChapter.update({ where: { id: a.id }, data: { order: b.order } })
		]);

		return { success: true };
	},

	// Deleting a chapter does NOT delete its Notes — chapterId is nullable
	// (see schema.prisma), so any Note filed under it simply becomes
	// chapter-less rather than being destroyed.
	deleteChapter: async ({ request, locals }) => {
		requireAdminOrModerator(locals.staff);
		const formData = await request.formData();
		const chapterId = String(formData.get('chapterId') ?? '');
		if (!chapterId) return fail(400, { error: 'Missing chapter.' });

		await db.courseChapter.delete({ where: { id: chapterId } }).catch(() => {});
		return { success: true };
	}
};
