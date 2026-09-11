// GET /api/v1/students/me — "who am I, and can I see anything right now."
// Deliberately separate from POST /students/login (which only returns
// enough identity to store a token) — this is what the frontend calls on
// app load / after auth to decide whether to render the "you haven't paid
// for this semester yet" screen (plans.txt §32) without a separate
// content-fetch round-trip failing first.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getActiveSemester } from '$lib/server/access/semester';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const semester = await getActiveSemester();

	const [access, enrollment] = await Promise.all([
		db.studentSemesterAccess.findUnique({
			where: { studentId_semesterId: { studentId: locals.student.id, semesterId: semester.id } }
		}),
		db.studentSemester.findUnique({
			where: { studentId_semesterId: { studentId: locals.student.id, semesterId: semester.id } }
		})
	]);

	const paid = !!access && access.isPaid && !access.revokedAt;

	return json({
		student: {
			id: locals.student.id,
			name: locals.student.name,
			studentCode: locals.student.studentCode
		},
		semester: { id: semester.id, name: semester.name },
		enrolled: !!enrollment,
		paid
	});
};
