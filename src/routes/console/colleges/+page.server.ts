import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdminOrModerator(locals.staff);

	const colleges = await db.college.findMany({
		orderBy: { name: 'asc' },
		include: {
			createdBy: { select: { name: true } },
			_count: { select: { courses: true, students: true } }
		}
	});

	return { colleges };
};

const createSchema = z.object({
	name: z.string().trim().min(2, 'Name must be at least 2 characters.')
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const staff = requireAdminOrModerator(locals.staff);

		const formData = Object.fromEntries(await request.formData());
		const parsed = createSchema.safeParse(formData);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0].message });
		}

		const existing = await db.college.findFirst({ where: { name: parsed.data.name } });
		if (existing) {
			return fail(400, { error: 'A college with this name already exists.' });
		}

		await db.college.create({
			data: { name: parsed.data.name, createdByStaffId: staff.id }
		});

		return { success: true };
	}
};
