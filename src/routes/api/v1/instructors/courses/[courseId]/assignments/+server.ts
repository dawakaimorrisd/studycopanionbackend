// GET /api/v1/instructors/courses/:courseId/assignments
//
// REDESIGNED for the unified, student-originated Assignment model — this
// is now THE list endpoint, full stop. It used to be a list of
// staff-authored prompts, with a separate nested "submissions" endpoint
// per assignment; both collapsed into one list of student-submitted
// homework, since Assignment IS the submission now (see
// schema.prisma's Assignment comment). Read-only, same as every other
// staff touchpoint with Assignment — Instructor/Admin/Moderator never
// create, generate, or publish one.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { canManageCourse } from '$lib/server/access/course';
import { getActiveSemester } from '$lib/server/access/semester';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();

	const semester = await getActiveSemester();

	const canManage = await canManageCourse(locals.staff, params.courseId, semester.id);
	if (!canManage) return API_ERRORS.noAccess('course');

	const assignments = await db.assignment.findMany({
		where: { courseId: params.courseId, semesterId: semester.id },
		select: {
			id: true,
			title: true,
			type: true,
			groupName: true,
			submittedAt: true,
			generatedAt: true,
			pdfUrl: true,
			pdfConversionError: true,
			submittedBy: { select: { id: true, name: true, studentCode: true } },
			members: { include: { student: { select: { id: true, name: true, studentCode: true } } } },
			_count: { select: { questionUnits: true } }
		},
		orderBy: { submittedAt: 'desc' }
	});

	return json({
		assignments: assignments.map((a) => ({
			id: a.id,
			title: a.title,
			type: a.type,
			groupName: a.groupName,
			submittedBy: a.submittedBy,
			members: a.members.map((m) => m.student),
			submittedAt: a.submittedAt,
			generatedAt: a.generatedAt,
			pdfUrl: a.pdfUrl,
			pdfConversionError: a.pdfConversionError,
			questionUnitCount: a._count.questionUnits
		}))
	});
};
