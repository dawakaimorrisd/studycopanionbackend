// Same gap as students/[id] — the staff roster had create + deactivate +
// course assignment, but no way to fix a typo'd name, change a role, or
// reset a forgotten password without deleting and recreating the account
// (which would also drop their InstructorCourse assignments). This page
// fills that gap. Admin-only throughout — matches the list page's existing
// rule that only Admin mutates staff accounts.
import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/permissions';
import { hashPassword } from '$lib/server/auth/password';
import { getActiveSemester } from '$lib/server/access/semester';
import { activateInstructorAccess, revokeInstructorAccess } from '$lib/server/access/payment';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals.staff);

	const semester = await getActiveSemester();

	const staff = await db.staffUser.findUnique({
		where: { id: params.id },
		include: {
			// Phase 10+: only the active semester's assignments are shown/
			// editable here — same reasoning as the staff list page.
			instructorCourses: {
				where: { semesterId: semester.id },
				include: { course: { select: { id: true, name: true, courseCode: true } } }
			}
		}
	});
	if (!staff || staff.deletedAt) throw error(404, 'Staff account not found.');

	const courses = await db.course.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, courseCode: true } });

	// Phase 11: access/payment is only meaningful for an Instructor account —
	// Admin/Moderator have unconditional access (see canManageCourse).
	const [access, payments] =
		staff.role === 'INSTRUCTOR'
			? await Promise.all([
					db.instructorSemesterAccess.findUnique({
						where: { instructorId_semesterId: { instructorId: params.id, semesterId: semester.id } }
					}),
					db.accessPayment.findMany({
						where: { instructorId: params.id, semesterId: semester.id },
						orderBy: { recordedAt: 'desc' },
						include: { recordedBy: { select: { name: true } } }
					})
				])
			: [null, []];

	return {
		staff,
		courses,
		currentStaffId: locals.staff!.id,
		semester: { id: semester.id, name: semester.name },
		access,
		payments
	};
};

const editSchema = z.object({
	name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
	role: z.enum(['ADMIN', 'MODERATOR', 'INSTRUCTOR'])
});

const passwordSchema = z.object({
	password: z.string().min(8, 'Password must be at least 8 characters.')
});

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const staff = requireAdmin(locals.staff);

		const formData = Object.fromEntries(await request.formData());
		const parsed = editSchema.safeParse(formData);
		if (!parsed.success) return fail(400, { error: parsed.error.issues[0].message });

		// An Admin can't demote themselves out of Admin — same "don't lock
		// yourself out of the console" rule as deactivate already enforces.
		if (params.id === staff.id && parsed.data.role !== 'ADMIN') {
			return fail(400, { error: "You can't change your own role away from Admin." });
		}

		const collision = await db.staffUser.findFirst({
			where: { name: parsed.data.name, id: { not: params.id }, deletedAt: null }
		});
		if (collision) return fail(400, { error: 'Another staff account already uses this name.' });

		await db.staffUser.update({
			where: { id: params.id },
			data: { name: parsed.data.name, role: parsed.data.role }
		});

		return { success: true };
	},

	resetPassword: async ({ request, locals, params }) => {
		requireAdmin(locals.staff);

		const formData = Object.fromEntries(await request.formData());
		const parsed = passwordSchema.safeParse(formData);
		if (!parsed.success) return fail(400, { error: parsed.error.issues[0].message });

		const passwordHash = await hashPassword(parsed.data.password);
		await db.staffUser.update({ where: { id: params.id }, data: { passwordHash } });
		// Force re-login everywhere with the new password.
		await db.session.deleteMany({ where: { staffId: params.id } });

		return { passwordReset: true };
	},

	assignCourse: async ({ request, locals, params }) => {
		requireAdmin(locals.staff);
		const formData = await request.formData();
		const courseId = String(formData.get('courseId') ?? '');
		if (!courseId) return fail(400, { error: 'Choose a course.' });

		const target = await db.staffUser.findUnique({ where: { id: params.id } });
		if (!target || target.role !== 'INSTRUCTOR') {
			return fail(400, { error: 'That account is not an Instructor.' });
		}

		const semester = await getActiveSemester();

		const already = await db.instructorCourse.findUnique({
			where: {
				instructorId_courseId_semesterId: { instructorId: params.id, courseId, semesterId: semester.id }
			}
		});
		if (already) return fail(400, { error: 'Already assigned for the current semester.' });

		await db.instructorCourse.create({ data: { instructorId: params.id, courseId, semesterId: semester.id } });
		return { success: true };
	},

	unassignCourse: async ({ request, locals, params }) => {
		requireAdmin(locals.staff);
		const formData = await request.formData();
		const courseId = String(formData.get('courseId') ?? '');
		if (!courseId) return fail(400, { error: 'Missing course.' });

		const semester = await getActiveSemester();

		await db.instructorCourse
			.delete({
				where: {
					instructorId_courseId_semesterId: { instructorId: params.id, courseId, semesterId: semester.id }
				}
			})
			.catch(() => {});
		return { success: true };
	},

	deactivate: async ({ locals, params }) => {
		const staff = requireAdmin(locals.staff);
		if (params.id === staff.id) return fail(400, { error: "You can't deactivate your own account." });

		await db.staffUser.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
		await db.session.deleteMany({ where: { staffId: params.id } });
		throw redirect(303, '/console/staff');
	},

	// Phase 11: same manual activation mechanism as a student's, applied to
	// an Instructor. See lib/server/access/payment.ts.
	activateAccess: async ({ request, locals, params }) => {
		const staff = requireAdmin(locals.staff);

		const target = await db.staffUser.findUnique({ where: { id: params.id } });
		if (!target || target.role !== 'INSTRUCTOR') {
			return fail(400, { error: 'That account is not an Instructor.' });
		}

		const semester = await getActiveSemester();
		const formData = await request.formData();
		const amount = Number(formData.get('amount') ?? '');
		const noteRaw = formData.get('note');

		if (!Number.isFinite(amount) || amount < 0) {
			return fail(400, { error: 'Enter a valid amount.' });
		}
		const amountCents = Math.round(amount * 100);

		await activateInstructorAccess(
			staff,
			params.id,
			semester.id,
			amountCents,
			typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : undefined
		);

		return { success: true };
	},

	revokeAccess: async ({ locals, params }) => {
		const staff = requireAdmin(locals.staff);
		const semester = await getActiveSemester();
		await revokeInstructorAccess(staff, params.id, semester.id);
		return { success: true };
	}
};
