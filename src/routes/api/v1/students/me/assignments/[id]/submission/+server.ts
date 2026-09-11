// GET /api/v1/students/me/assignments/:id/submission
//
// "Did I already submit this, and what's its current state." Returns the
// Assignment itself (unified model — Assignment IS the submission now, see
// schema.prisma) when the caller is either its submittedBy OR a tagged
// GROUP member — a member didn't create it themselves, but should still
// see "already submitted" rather than a fresh creation form, since their
// group already has one for this course. Returns null (not a 404) when
// there's nothing matching `:id` for this caller — a normal, expected
// state to check, not an error.
//
// NOTE: creation no longer happens here — POST was removed. See
// POST /students/me/courses/:courseId/assignments for the new
// (and now only) creation endpoint; there's nothing left to "submit to"
// at an existing assignment id, since nothing pre-exists for a student to
// submit against.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const assignment = await db.assignment.findFirst({
		where: {
			id: params.id,
			OR: [{ submittedById: locals.student.id }, { members: { some: { studentId: locals.student.id } } }]
		},
		include: {
			submittedBy: { select: { id: true, name: true, studentCode: true } },
			members: { include: { student: { select: { id: true, name: true, studentCode: true } } } },
			questionUnits: { orderBy: { order: 'asc' }, include: { dictionaryEntries: true } }
		}
	});

	if (!assignment) {
		return json({ submission: null });
	}

	return json({
		submission: {
			id: assignment.id,
			type: assignment.type,
			title: assignment.title,
			groupName: assignment.groupName,
			submittedBy: assignment.submittedBy,
			members: assignment.members.map((m) => m.student),
			isSubmitter: assignment.submittedById === locals.student.id,
			pdfUrl: assignment.pdfUrl,
			pdfConversionError: assignment.pdfConversionError,
			submittedAt: assignment.submittedAt,
			generatedAt: assignment.generatedAt,
			generationError: assignment.generationError,
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
		}
	});
};
