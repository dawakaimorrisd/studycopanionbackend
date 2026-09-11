// Gap found during a Phase 9 audit: the console had a student roster
// (list + Admin-only delete) but no way to actually edit a student's
// details — name, studentCode, or College — short of deleting and
// recreating them. This page fills that gap.
//
// Phase 10+: NoteAccess/AssignmentAccess (per-note manual grants) no longer
// exist — a student's academic access is now their semester enrollment
// (StudentSemester) + specific course enrollment (StudentCourse) for the
// active semester, both editable here. There is no per-note "revoke"
// anymore; removing a student from a course removes their access to every
// note/assignment in it at once, which is the intended model (build plan
// §3/§9). Edit is Admin-or-Moderator (matches the list page's viewing/
// deleting split: Moderator can do day-to-day content work, only Admin
// deletes).
import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { requireAdmin, requireAdminOrModerator } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import { activateStudentAccess, revokeStudentAccess } from '$lib/server/access/payment';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

	const semester = await getActiveSemester();

	const student = await db.student.findUnique({
		where: { id: params.id },
		include: {
			college: { select: { id: true, name: true } }
		}
	});
	if (!student || student.deletedAt) throw error(404, 'Student not found.');

	const [colleges, courses, studentSemester, enrolledCourseIds, access, payments] = await Promise.all([
		db.college.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
		db.course.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, courseCode: true } }),
		db.studentSemester.findUnique({
			where: { studentId_semesterId: { studentId: params.id, semesterId: semester.id } }
		}),
		db.studentCourse
			.findMany({
				where: { studentId: params.id, semesterId: semester.id },
				select: { courseId: true }
			})
			.then((rows) => rows.map((r) => r.courseId)),
		db.studentSemesterAccess.findUnique({
			where: { studentId_semesterId: { studentId: params.id, semesterId: semester.id } }
		}),
		db.accessPayment.findMany({
			where: { studentId: params.id, semesterId: semester.id },
			orderBy: { recordedAt: 'desc' },
			include: { recordedBy: { select: { name: true } } }
		})
	]);

	return {
		student,
		colleges,
		courses,
		semester: { id: semester.id, name: semester.name },
		isEnrolledThisSemester: !!studentSemester,
		enrolledCourseIds,
		access,
		payments
	};
};

const editSchema = z.object({
	name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
	studentCode: z.string().trim().min(1, 'Student code is required.'),
	collegeId: z.string().trim().min(1, 'Choose a College.')
});

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		requireAdminOrModerator(locals.staff);

		const formData = Object.fromEntries(await request.formData());
		const parsed = editSchema.safeParse(formData);
		if (!parsed.success) return fail(400, { error: parsed.error.issues[0].message });

		// studentCode is unique — check for a collision with a DIFFERENT
		// student before writing, so this fails with a clear message instead
		// of a raw constraint-violation 500.
		const collision = await db.student.findFirst({
			where: { studentCode: parsed.data.studentCode, id: { not: params.id }, deletedAt: null }
		});
		if (collision) return fail(400, { error: 'Another student already uses this code.' });

		await db.student.update({
			where: { id: params.id },
			data: {
				name: parsed.data.name,
				studentCode: parsed.data.studentCode,
				collegeId: parsed.data.collegeId
			}
		});

		return { success: true };
	},

	// Enrolls the student in the active semester (creating StudentSemester if
	// it doesn't exist yet) and sets their exact course list for it in one
	// go — the form submits the full checked-course set each time, so this
	// diffs against what's currently enrolled rather than only ever adding.
	setEnrollment: async ({ request, locals, params }) => {
		requireAdminOrModerator(locals.staff);

		const student = await db.student.findUnique({ where: { id: params.id }, select: { collegeId: true } });
		if (!student) return fail(404, { error: 'Student not found.' });

		const semester = await getActiveSemester();
		const formData = await request.formData();
		const selectedCourseIds = formData.getAll('courseId').map(String);

		await db.$transaction(async (tx) => {
			const studentSemester = await tx.studentSemester.upsert({
				where: { studentId_semesterId: { studentId: params.id, semesterId: semester.id } },
				update: {},
				create: { studentId: params.id, semesterId: semester.id, collegeId: student.collegeId }
			});

			const current = await tx.studentCourse.findMany({
				where: { studentId: params.id, semesterId: semester.id },
				select: { courseId: true }
			});
			const currentIds = new Set(current.map((c) => c.courseId));
			const nextIds = new Set(selectedCourseIds);

			const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
			const toAdd = [...nextIds].filter((id) => !currentIds.has(id));

			if (toRemove.length > 0) {
				await tx.studentCourse.deleteMany({
					where: { studentId: params.id, semesterId: semester.id, courseId: { in: toRemove } }
				});
			}
			if (toAdd.length > 0) {
				await tx.studentCourse.createMany({
					data: toAdd.map((courseId) => ({
						studentSemesterId: studentSemester.id,
						studentId: params.id,
						courseId,
						semesterId: semester.id
					}))
				});
			}
		});

		return { success: true };
	},

	deleteStudent: async ({ locals, params }) => {
		// Same rule as the list page: delete is Admin-only.
		requireAdmin(locals.staff);
		await db.student.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
		await db.studentSession.deleteMany({ where: { studentId: params.id } });
		throw redirect(303, '/console/students');
	},

	// Phase 11: manual, console-only payment activation. No gateway, no
	// webhook — Admin/Moderator enters an amount and this flips
	// StudentSemesterAccess.isPaid to true while also writing an
	// AccessPayment audit row, in one transaction (see
	// lib/server/access/payment.ts). This is the single action that
	// determines whether the student sees ANY content at all, regardless of
	// course enrollment.
	activateAccess: async ({ request, locals, params }) => {
		const staff = requireAdminOrModerator(locals.staff);
		const semester = await getActiveSemester();

		const formData = await request.formData();
		const amountRaw = String(formData.get('amount') ?? '');
		const noteRaw = formData.get('note');
		const amount = Number(amountRaw);

		if (!Number.isFinite(amount) || amount < 0) {
			return fail(400, { error: 'Enter a valid amount.' });
		}
		// Stored as cents (see schema.prisma's AccessPayment comment on why
		// Decimal isn't used here) — the console form takes a normal decimal
		// amount and this is the one place that converts it.
		const amountCents = Math.round(amount * 100);

		await activateStudentAccess(
			staff,
			params.id,
			semester.id,
			amountCents,
			typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : undefined
		);

		return { success: true };
	},

	revokeAccess: async ({ locals, params }) => {
		const staff = requireAdminOrModerator(locals.staff);
		const semester = await getActiveSemester();
		await revokeStudentAccess(staff, params.id, semester.id);
		return { success: true };
	}
};
