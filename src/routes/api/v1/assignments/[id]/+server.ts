// GET /api/v1/assignments/:id
//
// REDESIGNED for the unified, student-originated Assignment model (see
// schema.prisma's Assignment comment) — there is no separate staff prompt
// and student submission anymore; this IS the submission.
//
// ACCESS:
//   - Instructor/Admin/Moderator (canManageCourse): read-only, full access
//     to any Assignment in a course they manage — no ownership, no create/
//     generate/publish action exists for staff anymore.
//   - The student who submitted it, or a tagged GROUP member: full access
//     to their own Assignment.
//   - Any other student: no_access. Reading someone else's Assignment is
//     only possible via an explicit distribution they were sent (see
//     GET /students/me/received-distributions) — never through this
//     endpoint directly.
//
// UNGATED FOR EVERYONE WHO CAN SEE IT AT ALL — correctOption/explanation
// are always included, both for staff and for the submitter/members. This
// is a real, deliberate difference from the old staff-authored-content
// model's reveal-gate: there's no one else grading or controlling reveal
// of your own homework's self-check questions. (A RECIPIENT of a
// distributed Assignment's material is a different case, gated via
// DistributionDrillAttempt — see GET /students/me/received-distributions.)
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { canManageCourse } from '$lib/server/access/course';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const assignment = await db.assignment.findUnique({
		where: { id: params.id },
		include: {
			course: { select: { id: true, name: true, courseCode: true } },
			submittedBy: { select: { id: true, name: true, studentCode: true } },
			members: { include: { student: { select: { id: true, name: true, studentCode: true } } } },
			questionUnits: { orderBy: { order: 'asc' }, include: { dictionaryEntries: true } }
		}
	});
	if (!assignment) return API_ERRORS.notFound('Assignment');

	if (locals.staff) {
		const canManage = await canManageCourse(locals.staff, assignment.courseId, assignment.semesterId);
		if (!canManage) return API_ERRORS.noAccess('assignment');
	} else if (locals.student) {
		const isSubmitter = assignment.submittedById === locals.student.id;
		const isMember = assignment.members.some((m) => m.studentId === locals.student!.id);
		if (!isSubmitter && !isMember) return API_ERRORS.noAccess('assignment');
	} else {
		return API_ERRORS.notAuthenticated();
	}

	return json({
		id: assignment.id,
		title: assignment.title,
		type: assignment.type,
		groupName: assignment.groupName,
		course: assignment.course,
		submittedBy: assignment.submittedBy,
		members: assignment.members.map((m) => m.student),
		submittedAt: assignment.submittedAt,
		generatedAt: assignment.generatedAt,
		generationError: assignment.generationError,
		pdfUrl: assignment.pdfUrl,
		pdfConversionError: assignment.pdfConversionError,
		questionUnits: assignment.questionUnits.map((qu) => ({
			id: qu.id,
			order: qu.order,
			question: qu.question,
			optionA: qu.optionA,
			optionB: qu.optionB,
			optionC: qu.optionC,
			optionD: qu.optionD,
			correctOption: qu.correctOption,
			explanation: qu.explanation,
			isTable: qu.isTable,
			dictionaryEntries: qu.dictionaryEntries.map((d) => ({
				term: d.term,
				definition: d.definition,
				example: d.example
			}))
		}))
	});
};
