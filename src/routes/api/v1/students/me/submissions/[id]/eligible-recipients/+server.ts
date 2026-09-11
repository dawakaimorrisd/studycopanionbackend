// GET /api/v1/students/me/submissions/:id/eligible-recipients
//
// The data source for the "Send to Students" recipient picker — only
// paid + enrolled classmates in the assignment's own course/semester,
// same canReceiveDistribution predicate the actual POST /distribute
// re-checks at write time. Restricted to the assignment's submittedBy,
// same reasoning as /generate. Also GROUP-only, same reasoning as
// /generate — see canGenerateFromSubmission's comment. `:id` is the
// Assignment's own id (unified model — see schema.prisma).
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { eligibleStudentsForCourse } from '$lib/server/access/course';
import { canGenerateFromSubmission } from '$lib/server/access/assignment';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const assignment = await db.assignment.findUnique({
		where: { id: params.id },
		select: { id: true, submittedById: true, courseId: true, semesterId: true }
	});
	if (!assignment) return API_ERRORS.notFound('Assignment');
	if (assignment.submittedById !== locals.student.id) return API_ERRORS.noAccess('assignment');

	if (!(await canGenerateFromSubmission(assignment.id))) {
		return API_ERRORS.badRequest('Sending study material is only available for group assignments.');
	}

	const classmates = await eligibleStudentsForCourse(assignment.courseId, assignment.semesterId);

	return json({
		students: classmates.filter((s) => s.id !== locals.student!.id)
	});
};
