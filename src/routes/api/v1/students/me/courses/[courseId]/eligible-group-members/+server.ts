// GET /api/v1/students/me/courses/:courseId/eligible-group-members
//
// NEW — course-scoped, per Frontend Handoff v3. A student picks group
// members BEFORE the Assignment exists (creation is the single upload
// action — see .../courses/:courseId/assignments/+server.ts), so there's
// no assignment id yet to scope this to. Same shape/purpose as what used
// to be the assignment-scoped eligible-group-members endpoint — only
// paid + enrolled classmates in this course/semester, excluding self.
import { json } from '@sveltejs/kit';
import { eligibleStudentsForCourse } from '$lib/server/access/course';
import { canAccessCourse } from '$lib/server/access/course';
import { getActiveSemester } from '$lib/server/access/semester';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const semester = await getActiveSemester();

	const eligible = await canAccessCourse(locals.student.id, params.courseId, semester.id);
	if (!eligible) return API_ERRORS.noAccess('course');

	const classmates = await eligibleStudentsForCourse(params.courseId, semester.id);

	return json({
		students: classmates.filter((s) => s.id !== locals.student!.id)
	});
};
