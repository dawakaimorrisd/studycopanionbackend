// GET /api/v1/instructors/notes/:id/results
//
// Instructor-only test dashboard.
//
// Returns:
// - submission progress
// - individual student scores
// - question-level performance analytics
//
// Question analytics are based on NoteTestAnswer records, so the instructor
// can see which questions students understand and which ones need teaching
// attention.

// Phase 10+ note: this endpoint used to read its student list from
// Note.grantedTo (NoteAccess grant rows). NoteAccess no longer exists —
// eligibility is now computed (paid + enrolled), not granted per student.
// See eligibleStudentsForCourse in lib/server/access/course.ts. This swap
// is otherwise a pure data-source change; the scoring/analytics logic below
// is untouched. Full Phase 12 gating (e.g. only counting a Note once it's
// publishedAt) is not yet applied here — flagged, not silently assumed.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireInstructorCourseAccess } from '$lib/server/auth/permissions';
import { eligibleStudentsForCourse } from '$lib/server/access/course';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const note = await db.note.findUnique({
		where: { id: params.id },
		select: {
			id: true,
			title: true,
			chapterLabel: true,
			courseId: true,
			semesterId: true,
			testStartedAt: true,
			testRevealedAt: true,

			questionUnits: {
				select: {
					id: true,
					question: true,
					optionA: true,
					optionB: true,
					optionC: true,
					optionD: true,
					correctOption: true
				}
			}
		}
	});

	if (!note) return API_ERRORS.notFound('Note');

	try {
		await requireInstructorCourseAccess(locals.staff, note.courseId, note.semesterId);
	} catch {
		return API_ERRORS.noAccess('note');
	}

	const attempts = await db.noteTestAttempt.findMany({
		where: { noteId: note.id },
		select: {
			studentId: true,
			score: true,
			submittedAt: true,
			answers: {
				select: {
					questionUnitId: true,
					selectedOption: true,
					isCorrect: true
				}
			}
		}
	});

	// Eligible students (paid + enrolled), not "granted" students — see the
	// file-top note. This replaces the old NoteAccess-based grantedTo list.
	const eligibleStudents = await eligibleStudentsForCourse(note.courseId, note.semesterId);

	const attemptByStudentId = new Map(
		attempts.map((attempt) => [attempt.studentId, attempt])
	);

	const submitted: Array<{
		studentId: string;
		studentName: string;
		studentCode: string;
		score: number;
		totalQuestions: number;
		submittedAt: Date;
	}> = [];

	const notYetSubmitted: Array<{
		studentId: string;
		studentName: string;
		studentCode: string;
	}> = [];

	for (const student of eligibleStudents) {
		const attempt = attemptByStudentId.get(student.id);

		if (attempt) {
			submitted.push({
				studentId: student.id,
				studentName: student.name,
				studentCode: student.studentCode,
				score: attempt.score,
				totalQuestions: note.questionUnits.length,
				submittedAt: attempt.submittedAt
			});
		} else {
			notYetSubmitted.push({
				studentId: student.id,
				studentName: student.name,
				studentCode: student.studentCode
			});
		}
	}

	submitted.sort((a, b) => b.score - a.score);
	notYetSubmitted.sort((a, b) => a.studentName.localeCompare(b.studentName));

	// ------------------------------------------------------------
	// Question-level analytics
	// ------------------------------------------------------------

	const answerStats = new Map<
		string,
		{
			answered: number;
			correct: number;
			wrong: number;
			optionCounts: Record<string, number>;
		}
	>();

	for (const question of note.questionUnits) {
		answerStats.set(question.id, {
			answered: 0,
			correct: 0,
			wrong: 0,
			optionCounts: {
				A: 0,
				B: 0,
				C: 0,
				D: 0
			}
		});
	}

	for (const attempt of attempts) {
		for (const answer of attempt.answers) {
			const stats = answerStats.get(answer.questionUnitId);

			if (!stats) continue;

			stats.answered += 1;

			if (answer.isCorrect) {
				stats.correct += 1;
			} else {
				stats.wrong += 1;
			}

			if (answer.selectedOption in stats.optionCounts) {
				stats.optionCounts[answer.selectedOption] += 1;
			}
		}
	}

	const questionAnalytics = note.questionUnits.map((question, index) => {
		const stats = answerStats.get(question.id)!;

		const correctPercentage =
			stats.answered > 0
				? Math.round((stats.correct / stats.answered) * 100)
				: 0;

		let performance: 'strong' | 'middle' | 'weak';

		if (stats.answered === 0) {
			performance = 'middle';
		} else if (correctPercentage >= 70) {
			performance = 'strong';
		} else if (correctPercentage < 40) {
			performance = 'weak';
		} else {
			performance = 'middle';
		}

		return {
			id: question.id,
			number: index + 1,
			question: question.question,
			correctOption: question.correctOption,

			answered: stats.answered,
			correct: stats.correct,
			wrong: stats.wrong,
			correctPercentage,

			performance,

			optionCounts: stats.optionCounts
		};
	});

	// ------------------------------------------------------------
	// Overall test analytics
	// ------------------------------------------------------------

	const totalSubmitted = submitted.length;
	const totalQuestions = note.questionUnits.length;

	const totalPossiblePoints = totalSubmitted * totalQuestions;
	const totalEarnedPoints = submitted.reduce(
		(sum, student) => sum + student.score,
		0
	);

	const averageScore =
		totalSubmitted > 0
			? Number((totalEarnedPoints / totalSubmitted).toFixed(2))
			: 0;

	const averagePercentage =
		totalPossiblePoints > 0
			? Math.round((totalEarnedPoints / totalPossiblePoints) * 100)
			: 0;

	const strongQuestions = questionAnalytics.filter(
		(question) => question.performance === 'strong'
	);

	const middleQuestions = questionAnalytics.filter(
		(question) => question.performance === 'middle'
	);

	const weakQuestions = questionAnalytics.filter(
		(question) => question.performance === 'weak'
	);

	return json({
		note: {
			id: note.id,
			title: note.title,
			chapterLabel: note.chapterLabel,
			totalQuestions,
			test: {
				started: Boolean(note.testStartedAt),
				revealed: Boolean(note.testRevealedAt)
			}
		},

		summary: {
			totalStudents: eligibleStudents.length,
			submitted: submitted.length,
			notYetSubmitted: notYetSubmitted.length,
			averageScore,
			averagePercentage
		},

		questionAnalytics,

		questionGroups: {
			strong: strongQuestions,
			middle: middleQuestions,
			weak: weakQuestions
		},

		submitted,
		notYetSubmitted
	});
};