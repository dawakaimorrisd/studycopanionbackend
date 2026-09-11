
// GET /api/v1/notes/:id
//
// Returns the full Note content for an authorized student or instructor.
//
// ACCESS RULES
//   - Student: must be paid + enrolled (canAccessCourse) for this note's
//     course/semester. Phase 10+ note: this used to check a NoteAccess
//     grant row; that table no longer exists — eligibility is computed.
//   - Instructor: the note's course must be assigned to them through
//     InstructorCourse, for the note's own semester.
//
// VISIBILITY RULES FOR STUDENTS
//   - rawText: always visible.
//   - dictionaryEntries: ALWAYS visible.
//   - question text + options: visible only after testStartedAt.
//   - correctOption + explanation: visible only after testRevealedAt.
//   - student's score: visible only after testRevealedAt.
//   - student's submitted answers: visible only after testRevealedAt.
//
// INSTRUCTOR
//   - Instructors see the complete question/test bundle regardless
//     of started/revealed state.
//
// IMPORTANT
//   Dictionary entries are general study material. They are NOT
//   considered test content and therefore must remain visible before
//   the instructor starts the chapter test.
//
// NOT YET APPLIED HERE (Phase 12): gating on note.publishedAt. This
// endpoint currently returns a generated note to any eligible student
// regardless of publish state — flagged, not silently decided; Phase 12
// adds the publishedAt check alongside the console's "Save for Students"
// action landing.

import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { canAccessCourse } from '$lib/server/access/course';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const note = await db.note.findUnique({
		where: { id: params.id },
		include: {
			course: {
				select: {
					id: true,
					name: true,
					courseCode: true
				}
			},
			questionUnits: {
				orderBy: {
					order: 'asc'
				},
				include: {
					dictionaryEntries: true
				}
			}
		}
	});

	if (!note) {
		return API_ERRORS.notFound('Note');
	}

	/*
	 * ------------------------------------------------------------
	 * STUDENT ATTEMPT
	 * ------------------------------------------------------------
	 *
	 * We retrieve the student's submitted answers as well as the
	 * score. The selected answers are only returned to the client
	 * after the instructor reveals the test.
	 */

	let studentAttempt: {
	submittedAt: Date;
	score: number;
	answers: {
		questionUnitId: string;
		selectedOption: string;
	}[];
} | null = null;

	/*
	 * ------------------------------------------------------------
	 * ACCESS CONTROL
	 * ------------------------------------------------------------
	 */

	if (locals.student) {
		const eligible = await canAccessCourse(locals.student.id, note.courseId, note.semesterId);

		if (!eligible) {
			return API_ERRORS.noAccess('note');
		}

		const attempt = await db.noteTestAttempt.findUnique({
			where: {
				studentId_noteId: {
					studentId: locals.student.id,
					noteId: note.id
				}
			},
			select: {
				submittedAt: true,
				score: true,
				answers: {
					select: {
						questionUnitId: true,
						selectedOption: true
					}
				}
			}
		});

		if (attempt) {
			studentAttempt = attempt;
		}
	} else if (locals.staff) {
		/*
		 * Only instructors may use this content endpoint.
		 */
		if (locals.staff.role !== 'INSTRUCTOR') {
			return API_ERRORS.notAnInstructor();
		}

		const assignment = await db.instructorCourse.findUnique({
			where: {
				instructorId_courseId_semesterId: {
					instructorId: locals.staff.id,
					courseId: note.course.id,
					semesterId: note.semesterId
				}
			}
		});

		if (!assignment) {
			return API_ERRORS.noAccess('note');
		}
	} else {
		return API_ERRORS.notAuthenticated();
	}

	/*
	 * ------------------------------------------------------------
	 * VISIBILITY
	 * ------------------------------------------------------------
	 */

	const isStaff = Boolean(locals.staff);

	/*
	 * Instructors always see the complete test.
	 *
	 * Students only see question text/options after the instructor
	 * starts the test.
	 */
	const questionsVisible =
		isStaff || Boolean(note.testStartedAt);

	/*
	 * Instructors always see answers.
	 *
	 * Students only see correct answers/explanations and their own
	 * submitted answers after the instructor reveals the test.
	 */
	const answersVisible =
		isStaff || Boolean(note.testRevealedAt);

	/*
	 * ------------------------------------------------------------
	 * RESPONSE
	 * ------------------------------------------------------------
	 */

	return json({
		id: note.id,
		title: note.title,
		chapterLabel: note.chapterLabel,
		rawText: note.rawText,
		course: note.course,
		createdAt: note.createdAt,
		generatedAt: note.generatedAt,
		publishedAt: note.publishedAt,

		test: {
			started: Boolean(note.testStartedAt),
			revealed: Boolean(note.testRevealedAt),

			/*
			 * Student-only attempt information.
			 *
			 * Before reveal:
			 *   - submittedAt is visible
			 *   - score is hidden
			 *   - selected answers are hidden
			 *
			 * After reveal:
			 *   - score is visible
			 *   - selected answers are visible
			 */
			myAttempt: locals.student
				? studentAttempt
					? {
							submittedAt: studentAttempt.submittedAt,
							score: answersVisible
								? studentAttempt.score
								: null,
							totalQuestions: note.questionUnits.length,

							answers: answersVisible
								? studentAttempt.answers.map((answer) => ({
										questionUnitId:
											answer.questionUnitId,
										selectedOption:
											answer.selectedOption
									}))
								: []
						}
					: null
				: undefined
		},

		/*
		 * --------------------------------------------------------
		 * QUESTION UNITS + DICTIONARY
		 * --------------------------------------------------------
		 *
		 * We ALWAYS return the questionUnits array.
		 *
		 * Dictionary entries are general study material and remain
		 * visible regardless of test state.
		 */
		questionUnits: note.questionUnits.map((qu) => ({
			id: qu.id,
			order: qu.order,

			/*
			 * Hide the actual test question before the test starts.
			 *
			 * Empty strings are used instead of null because the shared
			 * QuestionUnit frontend type defines these fields as strings.
			 */
			question: questionsVisible ? qu.question : '',
			optionA: questionsVisible ? qu.optionA : '',
			optionB: questionsVisible ? qu.optionB : '',
			optionC: questionsVisible ? qu.optionC : '',
			optionD: questionsVisible ? qu.optionD : '',

			/*
			 * Correct answer is hidden until reveal.
			 */
			correctOption: answersVisible
				? qu.correctOption
				: null,

			/*
			 * Explanation is hidden until reveal.
			 */
			explanation: answersVisible
				? qu.explanation
				: null,

			isTable: qu.isTable,

			/*
			 * Dictionary entries are ALWAYS returned.
			 */
			dictionaryEntries: qu.dictionaryEntries.map((d) => ({
				term: d.term,
				definition: d.definition,
				example: d.example
			}))
		}))
	});
};

