// GET /api/v1/instructors/me/courses — read-only. This is the entirety of
// an Instructor's course visibility: exactly the courses assigned via
// InstructorCourse FOR THE ACTIVE SEMESTER, nothing else (no colleges, no
// other courses, and no other semester's assignments — an instructor
// assigned to Economics last semester is not automatically assigned to it
// this semester; see PHASE_10_PLUS_BUILD_PLAN.md Phase 10).
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getActiveSemester } from '$lib/server/access/semester';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const semester = await getActiveSemester();

	const assignments = await db.instructorCourse.findMany({
		where: { instructorId: locals.staff.id, semesterId: semester.id },
		include: { course: { select: { id: true, name: true, courseCode: true } } },
		orderBy: { course: { name: 'asc' } }
	});

	return json({
		semester: { id: semester.id, name: semester.name },
		courses: assignments.map((a) => a.course)
	});
};
