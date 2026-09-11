// Phase 10+ central authorization primitives — course layer.
//
// canAccessCourse is the single predicate every student-facing content
// route (Notes, Assignments, submissions, distributions) must call before
// returning anything. canManageCourse is the equivalent for staff writes
// (upload, generate, publish). Neither is ever bypassed because the
// frontend already filtered a list — see PHASE_10_PLUS_BUILD_PLAN.md §1 and
// §55 of the original plan doc: hiding something client-side is not access
// control.
import { db } from '$lib/server/db';
import type { StaffUser } from '@prisma/client';
import { canAccessSemester, canAccessSemesterAsInstructor } from './semester';

/**
 * True iff the student is paid for this semester AND specifically enrolled
 * (via StudentCourse) in this course for this semester. Both conditions are
 * required — paid-but-not-enrolled sees nothing for this course, and
 * enrolled-but-unpaid sees nothing at all.
 */
export async function canAccessCourse(
	studentId: string,
	courseId: string,
	semesterId: string
): Promise<boolean> {
	const paid = await canAccessSemester(studentId, semesterId);
	if (!paid) return false;

	const enrollment = await db.studentCourse.findUnique({
		where: { studentId_courseId_semesterId: { studentId, courseId, semesterId } }
	});
	return !!enrollment;
}

/**
 * True iff `staff` may create/generate/publish content for this course in
 * this semester. ADMIN/MODERATOR: unconditional. INSTRUCTOR: must be
 * assigned to the course for this specific semester via InstructorCourse,
 * AND have paid InstructorSemesterAccess for this semester — an instructor
 * whose access lapsed mid-semester loses the ability to do anything
 * course-related, same as an unpaid student loses content access.
 */
export async function canManageCourse(
	staff: StaffUser,
	courseId: string,
	semesterId: string
): Promise<boolean> {
	if (staff.role === 'ADMIN' || staff.role === 'MODERATOR') return true;
	if (staff.role !== 'INSTRUCTOR') return false;

	const assigned = await db.instructorCourse.findUnique({
		where: { instructorId_courseId_semesterId: { instructorId: staff.id, courseId, semesterId } }
	});
	if (!assigned) return false;

	return canAccessSemesterAsInstructor(staff.id, semesterId);
}

/**
 * Every student currently eligible for this course/semester — paid +
 * enrolled, the same predicate canAccessCourse checks per-student, just
 * batched. This is the query behind "who should see this course's content"
 * anywhere a full list is needed (instructor dashboards, distribution
 * recipient pickers), replacing what used to be answered by iterating
 * NoteAccess/AssignmentAccess grant rows in the Phase 0–9 code — those
 * tables no longer exist; eligibility is computed, not stored (see
 * PHASE_10_PLUS_BUILD_PLAN.md §8's Phase 12 note).
 */
export async function eligibleStudentsForCourse(
	courseId: string,
	semesterId: string
): Promise<Array<{ id: string; name: string; studentCode: string }>> {
	const enrollments = await db.studentCourse.findMany({
		where: {
			courseId,
			semesterId,
			student: {
				deletedAt: null,
				semesterAccesses: { some: { semesterId, isPaid: true, revokedAt: null } }
			}
		},
		select: { student: { select: { id: true, name: true, studentCode: true } } },
		orderBy: { student: { name: 'asc' } }
	});
	return enrollments.map((e) => e.student);
}

/** All courseIds a given Instructor is assigned to for a specific semester. */
export async function instructorCourseIdsForSemester(
	instructorId: string,
	semesterId: string
): Promise<string[]> {
	const rows = await db.instructorCourse.findMany({
		where: { instructorId, semesterId },
		select: { courseId: true }
	});
	return rows.map((r) => r.courseId);
}
