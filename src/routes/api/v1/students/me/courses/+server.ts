// GET /api/v1/students/me/courses — the active semester's StudentCourse
// enrollment for the signed-in student. Deliberately just "what am I
// enrolled in" — not "what am I eligible to see," which also requires paid
// StudentSemesterAccess (Phase 11) and is a separate concern from
// enrollment itself. A student can be enrolled and unpaid; this endpoint
// still returns their courses so the frontend can render "you're enrolled
// in these, pay to unlock them" rather than an empty list.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getActiveSemester } from '$lib/server/access/semester';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const semester = await getActiveSemester();

	const enrollments = await db.studentCourse.findMany({
		where: { studentId: locals.student.id, semesterId: semester.id },
		include: { course: { select: { id: true, name: true, courseCode: true } } },
		orderBy: { course: { name: 'asc' } }
	});

	return json({
		semester: { id: semester.id, name: semester.name },
		courses: enrollments.map((e) => e.course)
	});
};
