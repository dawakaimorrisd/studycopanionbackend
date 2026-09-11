import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { requireAdmin, requireAdminOrModerator } from '$lib/server/auth/permissions';
import { hashPassword } from '$lib/server/auth/password';
import { getActiveSemester } from '$lib/server/access/semester';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Viewing the roster is fine for Moderator too; only mutating it is
	// Admin-only (enforced per-action below).
	requireAdminOrModerator(locals.staff);

	const semester = await getActiveSemester();

	const [staff, courses] = await Promise.all([
		db.staffUser.findMany({
			where: { deletedAt: null },
			orderBy: [{ role: 'asc' }, { name: 'asc' }],
			include: {
				// Phase 10+: only this instructor's CURRENT-semester course
				// assignments are shown/editable here — a prior semester's
				// assignments still exist in the DB but aren't this page's concern.
				instructorCourses: {
					where: { semesterId: semester.id },
					include: { course: { select: { id: true, name: true, courseCode: true } } }
				}
			}
		}),
		db.course.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, courseCode: true } })
	]);

	return { staff, courses, currentStaffId: locals.staff!.id, semester: { id: semester.id, name: semester.name } };
};

const createSchema = z.object({
	name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
	password: z.string().min(8, 'Password must be at least 8 characters.'),
	role: z.enum(['ADMIN', 'MODERATOR', 'INSTRUCTOR'])
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		// Per the plan: only an Admin creates staff accounts of any kind —
		// Moderator, Instructor, or another Admin.
		requireAdmin(locals.staff);

		const formData = Object.fromEntries(await request.formData());
		const parsed = createSchema.safeParse(formData);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0].message });
		}

		const existing = await db.staffUser.findFirst({
			where: { name: parsed.data.name, deletedAt: null }
		});
		if (existing) {
			return fail(400, { error: 'A staff account with this name already exists.' });
		}

		const passwordHash = await hashPassword(parsed.data.password);
		await db.staffUser.create({
			data: { name: parsed.data.name, passwordHash, role: parsed.data.role }
		});

		return { success: true };
	},

	// Phase 10+: course assignment is always for the active semester — there
	// is no semester picker on this form. Assigning an instructor to a
	// course in a past or future semester happens only as part of that
	// semester's own activation/rollover, never manually from here.
	assignCourse: async ({ request, locals }) => {
		requireAdmin(locals.staff);
		const formData = await request.formData();
		const instructorId = String(formData.get('instructorId') ?? '');
		const courseId = String(formData.get('courseId') ?? '');
		if (!instructorId || !courseId) return fail(400, { error: 'Missing instructor or course.' });

		const instructor = await db.staffUser.findUnique({ where: { id: instructorId } });
		if (!instructor || instructor.role !== 'INSTRUCTOR') {
			return fail(400, { error: 'That account is not an Instructor.' });
		}

		const semester = await getActiveSemester();

		const already = await db.instructorCourse.findUnique({
			where: { instructorId_courseId_semesterId: { instructorId, courseId, semesterId: semester.id } }
		});
		if (already) return fail(400, { error: 'Already assigned for the current semester.' });

		await db.instructorCourse.create({ data: { instructorId, courseId, semesterId: semester.id } });
		return { success: true };
	},

	unassignCourse: async ({ request, locals }) => {
		requireAdmin(locals.staff);
		const formData = await request.formData();
		const instructorId = String(formData.get('instructorId') ?? '');
		const courseId = String(formData.get('courseId') ?? '');
		if (!instructorId || !courseId) return fail(400, { error: 'Missing instructor or course.' });

		const semester = await getActiveSemester();

		await db.instructorCourse
			.delete({
				where: { instructorId_courseId_semesterId: { instructorId, courseId, semesterId: semester.id } }
			})
			.catch(() => {});
		return { success: true };
	},

	deactivate: async ({ request, locals }) => {
		// Admin-only, and an Admin can't deactivate themselves — that path
		// leads to a console nobody can administer.
		const staff = requireAdmin(locals.staff);
		const formData = await request.formData();
		const staffId = String(formData.get('staffId') ?? '');
		if (!staffId) return fail(400, { error: 'Missing staff id.' });
		if (staffId === staff.id) return fail(400, { error: "You can't deactivate your own account." });

		await db.staffUser.update({ where: { id: staffId }, data: { deletedAt: new Date() } });
		// Also invalidate any active sessions for the deactivated account.
		await db.session.deleteMany({ where: { staffId } });

		return { success: true };
	}
};
