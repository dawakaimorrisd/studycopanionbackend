// Phase 10+ central authorization primitives — semester layer.
//
// Every content/enrollment/access route calls into these rather than
// checking `semester.isActive` or `StudentSemesterAccess.isPaid` inline —
// see PHASE_10_PLUS_BUILD_PLAN.md §1. Keeping this here means "what counts
// as active/paid" can't drift between routes.
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { Semester, Prisma } from '@prisma/client';

/**
 * The single authoritative current semester. Throws a real 500-class error
 * (not a 404) if none is active — that's an ops misconfiguration, not a
 * missing resource, and every caller downstream (content, analytics,
 * enrollment) depends on this existing.
 */
export async function getActiveSemester(): Promise<Semester> {
	const semester = await db.semester.findFirst({ where: { isActive: true } });
	if (!semester) {
		throw error(500, 'No active semester is configured. An Admin must activate one from the console.');
	}
	return semester;
}

/**
 * Does this student have live, unrevoked, paid access for this semester?
 * This is the gate every content/submission/distribution check below layers
 * on top of — enrollment alone (StudentCourse) is never sufficient on its
 * own; see PHASE_10_PLUS_BUILD_PLAN.md's Phase 11 note.
 */
export async function canAccessSemester(studentId: string, semesterId: string): Promise<boolean> {
	const access = await db.studentSemesterAccess.findUnique({
		where: { studentId_semesterId: { studentId, semesterId } }
	});
	return !!access && access.isPaid && !access.revokedAt;
}

/** Instructor equivalent of canAccessSemester. */
export async function canAccessSemesterAsInstructor(
	instructorId: string,
	semesterId: string
): Promise<boolean> {
	const access = await db.instructorSemesterAccess.findUnique({
		where: { instructorId_semesterId: { instructorId, semesterId } }
	});
	return !!access && access.isPaid && !access.revokedAt;
}

/**
 * Activates `semesterId`, deactivating whatever was previously active, in
 * one transaction — there is never a moment where two semesters are both
 * active or none is. Idempotent: activating the already-active semester is
 * a no-op.
 *
 * Phase 17: also performs the enrollment rollover — see
 * rollForwardStudentEnrollment below. Instructor course assignments are
 * deliberately NOT rolled forward (plans.txt §4: "an instructor could teach
 * Economics this semester and not teach it next semester" — Admin
 * reassigns each semester explicitly; there is nothing to carry forward by
 * default).
 */
export async function activateSemester(semesterId: string): Promise<Semester> {
	return db.$transaction(async (tx) => {
		const target = await tx.semester.findUnique({ where: { id: semesterId } });
		if (!target) throw error(404, 'Semester not found.');
		if (target.isActive) return target;

		const previousActive = await tx.semester.findFirst({ where: { isActive: true } });

		await tx.semester.updateMany({ where: { isActive: true }, data: { isActive: false } });
		const activated = await tx.semester.update({ where: { id: semesterId }, data: { isActive: true } });

		if (previousActive) {
			await rollForwardStudentEnrollment(tx, previousActive.id, semesterId);
		}

		return activated;
	});
}

/**
 * Copies every student's academic structure from `fromSemesterId` to
 * `toSemesterId` as a starting point — StudentSemester (college taken from
 * the student's CURRENT record, not the old semester's snapshot, since a
 * student may have transferred colleges since) and every StudentCourse
 * enrollment. Creates a fresh, unpaid StudentSemesterAccess row — payment
 * NEVER copies forward; this is, per plans.txt §43, "one of the most
 * important business rules in the entire application." Everything copied
 * here is just a starting point: Admin/Moderator can still add, remove, or
 * change a student's courses in the new semester afterward, same as any
 * other semester.
 *
 * Idempotent by construction: every write is an upsert keyed on the
 * schema's own unique constraints, so calling this twice (or resuming after
 * a partial failure) never duplicates a StudentSemester or StudentCourse
 * row — the second run simply finds everything already in place and moves
 * on. Historical rows in `fromSemesterId` (StudySession, submissions,
 * Notes/Assignments, etc.) are never touched — only new, forward-looking
 * rows are created in `toSemesterId`.
 */
async function rollForwardStudentEnrollment(
	tx: Prisma.TransactionClient,
	fromSemesterId: string,
	toSemesterId: string
): Promise<void> {
	const outgoingEnrollments = await tx.studentSemester.findMany({
		where: { semesterId: fromSemesterId },
		select: {
			studentId: true,
			student: { select: { collegeId: true } },
			courses: { select: { courseId: true } }
		}
	});

	for (const enrollment of outgoingEnrollments) {
		const newStudentSemester = await tx.studentSemester.upsert({
			where: { studentId_semesterId: { studentId: enrollment.studentId, semesterId: toSemesterId } },
			update: {},
			create: {
				studentId: enrollment.studentId,
				semesterId: toSemesterId,
				collegeId: enrollment.student.collegeId
			}
		});

		for (const course of enrollment.courses) {
			await tx.studentCourse.upsert({
				where: {
					studentId_courseId_semesterId: {
						studentId: enrollment.studentId,
						courseId: course.courseId,
						semesterId: toSemesterId
					}
				},
				update: {},
				create: {
					studentSemesterId: newStudentSemester.id,
					studentId: enrollment.studentId,
					courseId: course.courseId,
					semesterId: toSemesterId
				}
			});
		}

		// isPaid defaults to false on create; the `update: {}` branch means an
		// existing access row (e.g. from a re-run) is left exactly as-is,
		// never reset back to unpaid if it had already been activated.
		await tx.studentSemesterAccess.upsert({
			where: { studentId_semesterId: { studentId: enrollment.studentId, semesterId: toSemesterId } },
			update: {},
			create: { studentId: enrollment.studentId, semesterId: toSemesterId, isPaid: false }
		});
	}
}

/**
 * Preview counts for the console's activation confirmation step (build plan
 * Phase 17: "This will roll forward 214 students across 6 courses...
 * before executing" — a one-way, high-blast-radius action deserves real
 * numbers, not a generic warning).
 */
export async function previewRollover(fromSemesterId: string): Promise<{ studentCount: number; courseEnrollmentCount: number }> {
	const [studentCount, courseEnrollmentCount] = await Promise.all([
		db.studentSemester.count({ where: { semesterId: fromSemesterId } }),
		db.studentCourse.count({ where: { semesterId: fromSemesterId } })
	]);
	return { studentCount, courseEnrollmentCount };
}
