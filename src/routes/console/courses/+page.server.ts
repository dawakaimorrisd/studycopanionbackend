import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdminOrModerator(locals.staff);

	const [courses, colleges] = await Promise.all([
		db.course.findMany({
			orderBy: { name: 'asc' },
			include: {
				colleges: { include: { college: { select: { id: true, name: true } } } },
				createdBy: { select: { name: true } },
				_count: { select: { notes: true, assignments: true, instructorAssignments: true } }
			}
		}),
		db.college.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
	]);

	return { courses, colleges };
};

const createSchema = z.object({
	name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
	courseCode: z
		.string()
		.trim()
		.min(2, 'Course code must be at least 2 characters.')
		.transform((v) => v.toUpperCase()),
	// Linking a college at creation is optional — see planning doc: "College
	// linkage is optional at creation." Zero or more college ids may come
	// through as a single string or an array depending on how many checkboxes
	// were checked.
	collegeIds: z.union([z.string(), z.array(z.string())]).optional()
});

function normalizeCollegeIds(input: string | string[] | undefined): string[] {
	if (!input) return [];
	return Array.isArray(input) ? input : [input];
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const staff = requireAdminOrModerator(locals.staff);

		const formData = await request.formData();
		const parsed = createSchema.safeParse({
			name: formData.get('name'),
			courseCode: formData.get('courseCode'),
			collegeIds: formData.getAll('collegeIds')
		});
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0].message });
		}

		const existing = await db.course.findUnique({ where: { courseCode: parsed.data.courseCode } });
		if (existing) {
			return fail(400, { error: `Course code "${parsed.data.courseCode}" is already in use.` });
		}

		const collegeIds = normalizeCollegeIds(parsed.data.collegeIds);

		await db.course.create({
			data: {
				name: parsed.data.name,
				courseCode: parsed.data.courseCode,
				createdByStaffId: staff.id,
				colleges: {
					create: collegeIds.map((collegeId) => ({ collegeId }))
				}
			}
		});

		return { success: true };
	},

	linkCollege: async ({ request, locals }) => {
		requireAdminOrModerator(locals.staff);
		const formData = await request.formData();
		const courseId = String(formData.get('courseId') ?? '');
		const collegeId = String(formData.get('collegeId') ?? '');
		if (!courseId || !collegeId) return fail(400, { error: 'Missing course or college.' });

		const already = await db.courseCollege.findUnique({
			where: { courseId_collegeId: { courseId, collegeId } }
		});
		if (already) return fail(400, { error: 'Already linked.' });

		await db.courseCollege.create({ data: { courseId, collegeId } });
		return { success: true };
	},

	unlinkCollege: async ({ request, locals }) => {
		requireAdminOrModerator(locals.staff);
		const formData = await request.formData();
		const courseId = String(formData.get('courseId') ?? '');
		const collegeId = String(formData.get('collegeId') ?? '');
		if (!courseId || !collegeId) return fail(400, { error: 'Missing course or college.' });

		await db.courseCollege
			.delete({ where: { courseId_collegeId: { courseId, collegeId } } })
			.catch(() => {});
		return { success: true };
	}
};
