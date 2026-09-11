// Computes exactly the fields the pitch deck's dashboard promises, per
// student, for one course: total study time, weekly activity pattern,
// last-studied, most-studied content, and an engaged/moderate/at-risk read.
// Everything here is computed from StudySession rows at query time —
// nothing is a stored running total (see schema.prisma's StudySession
// comment).
//
// Phase 10+ note: this used to source its student list from
// NoteAccess/AssignmentAccess grant rows, and its "neverOpened" signal from
// NoteAccess.openedAt. Both tables are gone — student list now comes from
// eligibleStudentsForCourse (paid + enrolled, computed), and "opened" is
// redefined as "has at least one StudySession row for this course" rather
// than a separate open-tracking field, per the flagged decision in
// PHASE_10_PLUS_BUILD_PLAN.md's Phase 12 section. Every function here is
// now semester-scoped — a course's progress is always progress *within a
// specific semester*, never all-time across every semester it's ever run.
import { db } from '$lib/server/db';
import { classifyEngagement, type EngagementLevel } from './engagement';
import { eligibleStudentsForCourse } from '$lib/server/access/course';

export interface MostStudiedContent {
	sourceType: 'NOTE' | 'ASSIGNMENT';
	id: string;
	title: string | null;
	/**
	 * The chapter this content belongs to, when it's a Note — populated
	 * from CourseChapter.title, not the free-text chapterLabel, so it
	 * matches whatever the console's chapter management page shows. Always
	 * null for an Assignment (assignments don't belong to a chapter) or a
	 * chapter-less Note. Per direct product clarification: we deliberately
	 * don't aggregate chapter-level aggregate dashboards (a course's
	 * chapters ARE its notes, so that's nearly note-level granularity and
	 * doesn't add a course dashboard signal) — but an instructor looking at
	 * a SPECIFIC student's activity should still be told which chapter that
	 * student was actually studying. This field is that.
	 */
	chapterTitle: string | null;
	seconds: number;
}

export interface StudentCourseProgress {
	studentId: string;
	studentName: string;
	studentCode: string;
	totalStudySeconds: number;
	lastStudiedAt: Date | null;
	/** The chapter of whatever note the student was MOST RECENTLY studying — see MostStudiedContent.chapterTitle's comment for why this exists despite dashboards otherwise being course-level only. */
	lastStudiedChapterTitle: string | null;
	mostStudiedContent: MostStudiedContent | null;
	/** Total seconds studied by day of week, index 0 = Sunday .. 6 = Saturday. */
	weeklyActivityByDay: number[];
	neverOpened: boolean;
	engagement: EngagementLevel;
}

export type ContentTypeFilter = ('NOTE' | 'ASSIGNMENT')[];

/**
 * All per-student progress for one course, for one semester — the
 * console's per-course drill-down.
 *
 * @param includeContentTypes Which content types to include. Defaults to
 *   both. The Instructor API passes `['NOTE']` only — Instructor has no
 *   Assignment access at all (build plan §2/§4), so their view of student
 *   progress must not surface Assignment-derived numbers or titles either.
 *   The console (Admin/Moderator) always uses the default, since they
 *   legitimately manage both.
 */
export async function computeCourseProgress(
	courseId: string,
	semesterId: string,
	includeContentTypes: ContentTypeFilter = ['NOTE', 'ASSIGNMENT']
): Promise<StudentCourseProgress[]> {
	const includeNotes = includeContentTypes.includes('NOTE');
	const includeAssignments = includeContentTypes.includes('ASSIGNMENT');

	const eligibleStudents = await eligibleStudentsForCourse(courseId, semesterId);
	const studentIds = eligibleStudents.map((s) => s.id);
	if (studentIds.length === 0) return [];

	const nameByStudent = new Map(eligibleStudents.map((s) => [s.id, s]));

	const sessions = await db.studySession.findMany({
		where: {
			studentId: { in: studentIds },
			courseId,
			semesterId,
			...(includeNotes && !includeAssignments ? { noteId: { not: null } } : {}),
			...(includeAssignments && !includeNotes ? { assignmentId: { not: null } } : {})
		},
		select: {
			studentId: true,
			durationSeconds: true,
			startedAt: true,
			noteId: true,
			assignmentId: true,
			note: { select: { title: true, chapter: { select: { title: true } } } },
			assignment: { select: { title: true } }
		}
	});

	interface Accumulator {
		totalStudySeconds: number;
		lastStudiedAt: Date | null;
		lastStudiedChapterTitle: string | null;
		weeklyActivityByDay: number[];
		contentTotals: Map<string, MostStudiedContent>;
	}

	const byStudent = new Map<string, Accumulator>();
	const openedStudentIds = new Set<string>();

	for (const session of sessions) {
		openedStudentIds.add(session.studentId);

		const acc = byStudent.get(session.studentId) ?? {
			totalStudySeconds: 0,
			lastStudiedAt: null,
			lastStudiedChapterTitle: null,
			weeklyActivityByDay: [0, 0, 0, 0, 0, 0, 0],
			contentTotals: new Map<string, MostStudiedContent>()
		};

		acc.totalStudySeconds += session.durationSeconds;
		if (!acc.lastStudiedAt || session.startedAt > acc.lastStudiedAt) {
			acc.lastStudiedAt = session.startedAt;
			// A student's most RECENT activity's chapter — the direct answer
			// to "what chapter is this student studying right now" (as
			// opposed to mostStudiedContent below, which is "what have they
			// spent the most cumulative time on").
			acc.lastStudiedChapterTitle = session.noteId ? (session.note?.chapter?.title ?? null) : null;
		}
		acc.weeklyActivityByDay[session.startedAt.getDay()] += session.durationSeconds;

		const sourceType: 'NOTE' | 'ASSIGNMENT' = session.noteId ? 'NOTE' : 'ASSIGNMENT';
		const contentId = (session.noteId ?? session.assignmentId)!;
		const key = `${sourceType}:${contentId}`;
		const content = acc.contentTotals.get(key) ?? {
			sourceType,
			id: contentId,
			title: session.noteId ? (session.note?.title ?? null) : (session.assignment?.title ?? null),
			chapterTitle: session.noteId ? (session.note?.chapter?.title ?? null) : null,
			seconds: 0
		};
		content.seconds += session.durationSeconds;
		acc.contentTotals.set(key, content);

		byStudent.set(session.studentId, acc);
	}

	return studentIds.map((studentId) => {
		const identity = nameByStudent.get(studentId)!;
		const acc = byStudent.get(studentId);
		const neverOpened = !openedStudentIds.has(studentId);

		let mostStudiedContent: MostStudiedContent | null = null;
		if (acc) {
			for (const content of acc.contentTotals.values()) {
				if (!mostStudiedContent || content.seconds > mostStudiedContent.seconds) {
					mostStudiedContent = content;
				}
			}
		}

		const lastStudiedAt = acc?.lastStudiedAt ?? null;

		return {
			studentId,
			studentName: identity.name,
			studentCode: identity.studentCode,
			totalStudySeconds: acc?.totalStudySeconds ?? 0,
			lastStudiedAt,
			lastStudiedChapterTitle: acc?.lastStudiedChapterTitle ?? null,
			mostStudiedContent,
			weeklyActivityByDay: acc?.weeklyActivityByDay ?? [0, 0, 0, 0, 0, 0, 0],
			neverOpened,
			engagement: classifyEngagement({ lastStudiedAt, neverOpened })
		};
	});
}

/** Just the counts, for the all-courses overview — cheaper than materializing every student's full record. */
export async function computeCourseEngagementCounts(
	courseId: string,
	semesterId: string,
	includeContentTypes: ContentTypeFilter = ['NOTE', 'ASSIGNMENT']
): Promise<{ engaged: number; moderate: number; atRisk: number; totalStudents: number }> {
	const progress = await computeCourseProgress(courseId, semesterId, includeContentTypes);
	return {
		engaged: progress.filter((p) => p.engagement === 'engaged').length,
		moderate: progress.filter((p) => p.engagement === 'moderate').length,
		atRisk: progress.filter((p) => p.engagement === 'at-risk').length,
		totalStudents: progress.length
	};
}

export interface CourseChapterTestSummary {
	attemptsCount: number;
	/** null when there have been no attempts at all yet — distinct from 0%. */
	averageScorePercent: number | null;
	chaptersStarted: number;
}

// One course's worth of chapter-test signal, rolled up to a single summary
// — the list-level counterpart to computeChapterTestScores' full per-
// student detail. Used by the college/global overview pages below and by
// the per-course progress page's header.
export async function computeCourseChapterTestSummary(
	courseId: string,
	semesterId: string
): Promise<CourseChapterTestSummary> {
	const [attempts, chaptersStarted] = await Promise.all([
		db.noteTestAttempt.findMany({
			where: { note: { courseId, semesterId } },
			select: { score: true, note: { select: { questionUnits: { select: { id: true } } } } }
		}),
		db.note.count({ where: { courseId, semesterId, testStartedAt: { not: null } } })
	]);

	if (attempts.length === 0) {
		return { attemptsCount: 0, averageScorePercent: null, chaptersStarted };
	}

	const percentSum = attempts.reduce((sum, a) => {
		const total = a.note.questionUnits.length;
		return sum + (total > 0 ? (a.score / total) * 100 : 0);
	}, 0);

	return {
		attemptsCount: attempts.length,
		averageScorePercent: Math.round(percentSum / attempts.length),
		chaptersStarted
	};
}

export interface CourseProgressSummary {
	course: { id: string; name: string; courseCode: string };
	engagement: { engaged: number; moderate: number; atRisk: number; totalStudents: number };
	testSummary: CourseChapterTestSummary;
}

// v9 amendment: the admin-wide progress dashboard — "we need to know in
// order to strengthen our marketing next semester," across every College,
// not just what an individual Instructor sees for their own courses. A
// Course can link to more than one College (CourseCollege is many-to-many),
// so a course serving two Colleges intentionally appears in both Colleges'
// breakdowns below — that's correct for "how are THIS college's students
// doing," even though it means the same course's numbers get counted twice
// across the whole app. The global overview avoids that double-count by
// iterating distinct Courses directly, not by summing the per-College
// breakdowns.
//
// This is N+1-query-per-course by design, same "compute at query time"
// philosophy as the rest of this file (see its top-of-file precedent) —
// fine at pilot-college scale, worth revisiting with real caching if this
// app's course count grows into the hundreds.
export async function computeCollegeCourseSummaries(
	collegeId: string,
	semesterId: string
): Promise<CourseProgressSummary[]> {
	const links = await db.courseCollege.findMany({
		where: { collegeId },
		include: { course: { select: { id: true, name: true, courseCode: true } } }
	});

	return Promise.all(
		links.map(async (link) => {
			const [engagement, testSummary] = await Promise.all([
				computeCourseEngagementCounts(link.course.id, semesterId),
				computeCourseChapterTestSummary(link.course.id, semesterId)
			]);
			return { course: link.course, engagement, testSummary };
		})
	);
}

export interface GlobalProgressOverview {
	totalStudentCoursePairs: number; // NOT distinct students — see the per-student-per-course note below
	engaged: number;
	moderate: number;
	atRisk: number;
	totalTestAttempts: number;
	averageTestScorePercent: number | null;
}

// The single overall dashboard number set. "totalStudentCoursePairs" is
// deliberately not called "totalStudents" — engagement in this app has
// always been computed per-student-per-course (a locked decision, see
// BACKEND_BUILD_PLAN.md §9), so a student sent content in three courses
// contributes three counted pairs here, same as everywhere else this
// classifier is used. Renaming it to make that explicit rather than
// inventing a new "distinct student" semantic just for this one dashboard.
//
// Phase 10+: scoped to one semester — the global dashboard is always "how
// is the current semester going," not an all-time blend across semesters.
export async function computeGlobalProgressOverview(semesterId: string): Promise<GlobalProgressOverview> {
	const courses = await db.course.findMany({ select: { id: true } });

	let totalStudentCoursePairs = 0;
	let engaged = 0;
	let moderate = 0;
	let atRisk = 0;
	let totalTestAttempts = 0;
	let weightedPercentSum = 0;

	for (const course of courses) {
		const [engagement, testSummary] = await Promise.all([
			computeCourseEngagementCounts(course.id, semesterId),
			computeCourseChapterTestSummary(course.id, semesterId)
		]);

		totalStudentCoursePairs += engagement.totalStudents;
		engaged += engagement.engaged;
		moderate += engagement.moderate;
		atRisk += engagement.atRisk;

		if (testSummary.attemptsCount > 0 && testSummary.averageScorePercent !== null) {
			totalTestAttempts += testSummary.attemptsCount;
			// Weighted by attempt count so a course with 2 attempts doesn't
			// pull the global average as hard as one with 200.
			weightedPercentSum += testSummary.averageScorePercent * testSummary.attemptsCount;
		}
	}

	return {
		totalStudentCoursePairs,
		engaged,
		moderate,
		atRisk,
		totalTestAttempts,
		averageTestScorePercent: totalTestAttempts > 0 ? Math.round(weightedPercentSum / totalTestAttempts) : null
	};
}

export interface ChapterTestScore {
	noteId: string;
	noteTitle: string | null;
	chapterLabel: string | null;
	score: number;
	totalQuestions: number;
	submittedAt: Date;
	/** Whether the Instructor has clicked "done" on this chapter yet — students only see the score once this is true, but the Instructor sees it regardless (see the corrected comment below). */
	revealed: boolean;
}

export interface StudentChapterTestScores {
	studentId: string;
	chapterTests: ChapterTestScore[];
}

// v9 (Phase 9): the score-trend-per-chapter-over-time signal the dean asked
// for — "instructor finds it harder to track student progress... test
// question, they take the test and still failed." Deliberately a *separate*
// query from computeCourseProgress rather than folded into it: this is an
// additive signal (are they passing the tests) alongside the existing one
// (are they opening the material at all), not a replacement — see the
// previous engineer's own framing in the Phase 9 discussion.
//
// CORRECTED: this originally only counted *revealed* attempts, on the
// assumption that an instructor shouldn't see a score before clicking
// "done" themselves. That was inconsistent with every other staff-facing
// endpoint in this app, which always shows staff everything regardless of
// reveal state — the reveal gate exists for students, not for the
// instructor who controls it. It also directly worked against the actual
// point of a progress dashboard: an instructor needs to see who's
// submitted and how they're doing *before* deciding to reveal, not after.
// Now returns every attempt, with a `revealed` flag per entry so a
// dashboard can still visually distinguish "official, student-visible"
// results from "in progress, instructor preview only" if it wants to.
export async function computeChapterTestScores(
	courseId: string,
	semesterId: string
): Promise<StudentChapterTestScores[]> {
	const attempts = await db.noteTestAttempt.findMany({
		where: {
			note: { courseId, semesterId }
		},
		select: {
			studentId: true,
			score: true,
			submittedAt: true,
			note: {
				select: {
					id: true,
					title: true,
					chapterLabel: true,
					testRevealedAt: true,
					questionUnits: { select: { id: true } }
				}
			}
		},
		orderBy: { submittedAt: 'asc' }
	});

	const byStudent = new Map<string, ChapterTestScore[]>();
	for (const attempt of attempts) {
		const list = byStudent.get(attempt.studentId) ?? [];
		list.push({
			noteId: attempt.note.id,
			noteTitle: attempt.note.title,
			chapterLabel: attempt.note.chapterLabel,
			score: attempt.score,
			totalQuestions: attempt.note.questionUnits.length,
			submittedAt: attempt.submittedAt,
			revealed: Boolean(attempt.note.testRevealedAt)
		});
		byStudent.set(attempt.studentId, list);
	}

	return Array.from(byStudent.entries()).map(([studentId, chapterTests]) => ({
		studentId,
		chapterTests
	}));
}
