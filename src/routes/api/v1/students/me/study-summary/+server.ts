// GET /api/v1/students/me/study-summary — the home-dashboard number set
// (plans.txt §15): this week's total study time, courses touched, the
// standout course, and a day streak. See
// lib/server/analytics/studyTime.ts's computeStudentStudySummary for the
// actual computation — this route is just auth + semester resolution.
import { json } from '@sveltejs/kit';
import { getActiveSemester } from '$lib/server/access/semester';
import { computeStudentStudySummary } from '$lib/server/analytics/studyTime';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const semester = await getActiveSemester();
	const summary = await computeStudentStudySummary(locals.student.id, semester.id);

	return json({ semester: { id: semester.id, name: semester.name }, ...summary });
};
