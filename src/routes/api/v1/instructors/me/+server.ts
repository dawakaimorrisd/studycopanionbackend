// GET /api/v1/instructors/me — Instructor equivalent of students/me. An
// Instructor with lapsed InstructorSemesterAccess can still log in and hit
// this endpoint (so the frontend can show them their unpaid state), but
// canManageCourse will refuse every content action until reactivated.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getActiveSemester } from '$lib/server/access/semester';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const semester = await getActiveSemester();

	const access = await db.instructorSemesterAccess.findUnique({
		where: { instructorId_semesterId: { instructorId: locals.staff.id, semesterId: semester.id } }
	});

	const paid = !!access && access.isPaid && !access.revokedAt;

	return json({
		staff: { id: locals.staff.id, name: locals.staff.name, role: locals.staff.role },
		semester: { id: semester.id, name: semester.name },
		paid
	});
};
