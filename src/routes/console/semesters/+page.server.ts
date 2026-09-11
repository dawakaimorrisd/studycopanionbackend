// Phase 10: the top-level academic container. Admin/Moderator creates a
// Semester with explicit start/end dates (no auto-generation from a date
// rolling over — see PHASE_10_PLUS_BUILD_PLAN.md Phase 17) and activates
// one at a time. Only one Semester is ever isActive; activateSemester
// enforces that atomically.
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { activateSemester, previewRollover } from '$lib/server/access/semester';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdminOrModerator(locals.staff);

	const semesters = await db.semester.findMany({
		orderBy: { startDate: 'desc' },
		include: {
			_count: {
				select: { studentSemesters: true, studentCourses: true, instructorCourses: true }
			}
		}
	});

	// Phase 17: the confirmation dialog needs real numbers for whichever
	// semester is CURRENTLY active — that's what would roll forward if the
	// person activates a different one. Zero cost if nothing is active yet
	// (first-ever semester).
	const currentlyActive = semesters.find((s) => s.isActive);
	const rolloverPreview = currentlyActive ? await previewRollover(currentlyActive.id) : null;

	return { semesters, rolloverPreview };
};

const createSchema = z
	.object({
		name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
		startDate: z.string().min(1, 'Start date is required.'),
		endDate: z.string().min(1, 'End date is required.')
	})
	.refine((data) => new Date(data.endDate) > new Date(data.startDate), {
		message: 'End date must be after start date.',
		path: ['endDate']
	});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdminOrModerator(locals.staff);

		const formData = Object.fromEntries(await request.formData());
		const parsed = createSchema.safeParse(formData);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0].message });
		}

		const existing = await db.semester.findFirst({ where: { name: parsed.data.name } });
		if (existing) {
			return fail(400, { error: 'A semester with this name already exists.' });
		}

		await db.semester.create({
			data: {
				name: parsed.data.name,
				startDate: new Date(parsed.data.startDate),
				endDate: new Date(parsed.data.endDate)
			}
		});

		return { success: true };
	},

	activate: async ({ request, locals }) => {
		requireAdminOrModerator(locals.staff);

		const formData = await request.formData();
		const semesterId = String(formData.get('semesterId') ?? '');
		if (!semesterId) return fail(400, { error: 'Missing semester id.' });

		await activateSemester(semesterId);
		return { success: true };
	}
};
