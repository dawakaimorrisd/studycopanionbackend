// GET /api/v1/students/me/content — every PUBLISHED Note in every course
// the student is paid + enrolled for, in the active semester — computed,
// not granted. An unpaid student gets an explicit `paid: false` with
// empty lists rather than a 403, so the frontend can render the "activate
// your semester access" screen instead of an error state.
//
// REDESIGNED for the unified, student-originated Assignment model: the
// `assignments` array here is no longer "every assignment published in my
// courses" (that concept doesn't exist anymore, and course-wide listing
// would have leaked classmates' private homework — Assignments are never
// course-broadcast, only visible to their submitter/members, staff, or an
// explicit distribution recipient). It's now "assignments I've submitted
// myself" — this student's own submission history, across every course
// they're enrolled in. A student with nothing submitted yet just gets an
// empty array; that's the expected default state, not an error.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getActiveSemester, canAccessSemester } from '$lib/server/access/semester';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const semester = await getActiveSemester();
	const paid = await canAccessSemester(locals.student.id, semester.id);

	if (!paid) {
		return json({ semester: { id: semester.id, name: semester.name }, paid: false, notes: [], assignments: [] });
	}

	const enrolledCourseIds = await db.studentCourse
		.findMany({ where: { studentId: locals.student.id, semesterId: semester.id }, select: { courseId: true } })
		.then((rows) => rows.map((r) => r.courseId));

	if (enrolledCourseIds.length === 0) {
		return json({ semester: { id: semester.id, name: semester.name }, paid: true, notes: [], assignments: [] });
	}

	const [notes, assignments] = await Promise.all([
		db.note.findMany({
			where: { courseId: { in: enrolledCourseIds }, semesterId: semester.id, publishedAt: { not: null } },
			select: {
				id: true,
				title: true,
				generatedAt: true,
				testStartedAt: true,
				testRevealedAt: true,
				course: { select: { name: true, courseCode: true } }
			},
			orderBy: { publishedAt: 'desc' }
		}),
		db.assignment.findMany({
			where: {
				courseId: { in: enrolledCourseIds },
				semesterId: semester.id,
				OR: [{ submittedById: locals.student.id }, { members: { some: { studentId: locals.student.id } } }]
			},
			select: {
				id: true,
				title: true,
				type: true,
				generatedAt: true,
				pdfUrl: true,
				pdfConversionError: true,
				submittedById: true,
				course: { select: { name: true, courseCode: true } }
			},
			orderBy: { submittedAt: 'desc' }
		})
	]);

	const testAttempts = await db.noteTestAttempt.findMany({
		where: { studentId: locals.student.id, noteId: { in: notes.map((n) => n.id) } },
		select: { noteId: true, score: true }
	});
	const testAttemptByNoteId = new Map(testAttempts.map((a) => [a.noteId, a]));

	return json({
		semester: { id: semester.id, name: semester.name },
		paid: true,
		notes: notes.map((n) => {
			const attempt = testAttemptByNoteId.get(n.id);
			return {
				id: n.id,
				title: n.title,
				course: n.course,
				generated: n.generatedAt !== null,
				test: {
					started: Boolean(n.testStartedAt),
					revealed: Boolean(n.testRevealedAt),
					submitted: Boolean(attempt),
					score: attempt && n.testRevealedAt ? attempt.score : null
				}
			};
		}),
		assignments: assignments.map((a) => ({
			id: a.id,
			title: a.title,
			type: a.type,
			course: a.course,
			generated: a.generatedAt !== null,
			pdfUrl: a.pdfUrl,
			pdfConversionError: a.pdfConversionError,
			isSubmitter: a.submittedById === locals.student!.id
		}))
	});
};
