// Every console form action and every API route handler calls into these,
// rather than checking `locals.staff.role === '...'` inline — see build
// plan §7. Keeping the checks here means the Admin-only-vs-Moderator and
// Instructor-course-scoping rules can't drift between routes.
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { StaffUser } from '@prisma/client';

export const STAFF_ROLES = ['ADMIN', 'MODERATOR', 'INSTRUCTOR'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Throws a 401/403 unless the signed-in staff member has one of `roles`. */
export function requireStaffRole(staff: StaffUser | null | undefined, roles: StaffRole[]): StaffUser {
	if (!staff) throw error(401, 'Not signed in.');
	if (!roles.includes(staff.role as StaffRole)) {
		throw error(403, 'You do not have permission to do this.');
	}
	return staff;
}

/** Admin and Moderator both do day-to-day content work; only Admin does account/roster management. */
export function requireAdminOrModerator(staff: StaffUser | null | undefined): StaffUser {
	return requireStaffRole(staff, ['ADMIN', 'MODERATOR']);
}

export function requireAdmin(staff: StaffUser | null | undefined): StaffUser {
	return requireStaffRole(staff, ['ADMIN']);
}

/**
 * Throws unless `staff` is an Instructor assigned to `courseId` FOR THIS
 * SPECIFIC SEMESTER via InstructorCourse. Admin/Moderator are NOT given a
 * pass here on purpose — this helper is specifically for the
 * Instructor-scoped API routes; console routes for Admin/Moderator should
 * call requireAdminOrModerator instead, since their access isn't
 * course-scoped at all.
 *
 * Phase 10+ breaking change from Phase 0–9: `semesterId` is now required.
 * InstructorCourse's unique constraint is [instructorId, courseId,
 * semesterId] — an instructor assigned to Economics in one semester is NOT
 * automatically assigned to it in the next; every call site was updated to
 * pass the active semester's id (see lib/server/access/semester.ts's
 * getActiveSemester) as part of this same change, not incrementally.
 *
 * This checks course assignment only. It does NOT check paid
 * InstructorSemesterAccess — for the combined check (assigned AND paid),
 * use canManageCourse in lib/server/access/course.ts, which is what content
 * write routes should actually call.
 */
export async function requireInstructorCourseAccess(
	staff: StaffUser,
	courseId: string,
	semesterId: string
): Promise<void> {
	if (staff.role !== 'INSTRUCTOR') {
		throw error(403, 'Only an Instructor account can use this endpoint.');
	}
	const assignment = await db.instructorCourse.findUnique({
		where: { instructorId_courseId_semesterId: { instructorId: staff.id, courseId, semesterId } }
	});
	if (!assignment) {
		throw error(403, 'You are not assigned to this course for the current semester.');
	}
}

/** All courseIds a given Instructor is assigned to for a specific semester — the basis of their scope for that semester. */
export async function instructorCourseIds(staffId: string, semesterId: string): Promise<string[]> {
	const rows = await db.instructorCourse.findMany({
		where: { instructorId: staffId, semesterId },
		select: { courseId: true }
	});
	return rows.map((r: { courseId: string }) => r.courseId);
}
