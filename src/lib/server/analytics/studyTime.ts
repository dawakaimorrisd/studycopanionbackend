// Phase 13 — the aggregation shapes courseProgress.ts doesn't cover:
// chapter-level breakdowns, weekly/streak summaries for a single student,
// and time-window filtering. Everything here is computed from StudySession
// at query time, same philosophy as courseProgress.ts (see its top-of-file
// comment) — nothing is a stored running total. Kept as its own module
// rather than folded into courseProgress.ts because that file is already
// large and these are a genuinely different axis (chapter/time, not
// student/engagement).
import { db } from '$lib/server/db';

export interface ChapterBreakdownEntry {
	chapterId: string | null;
	chapterTitle: string | null;
	totalStudySeconds: number;
	studentCount: number; // distinct students who logged any time on this chapter
}

/**
 * Every chapter in a course/semester, with total study time and distinct
 * student count — including chapters with ZERO activity (a left-join in
 * spirit: start from CourseChapter, not from StudySession, so an untouched
 * chapter still shows up as 0 rather than being silently absent). A final
 * entry with `chapterId: null` rolls up study time on notes that aren't
 * filed under any chapter, so the totals are complete even for courses that
 * don't use chapters at all.
 */
export async function computeChapterBreakdown(
	courseId: string,
	semesterId: string
): Promise<ChapterBreakdownEntry[]> {
	const [chapters, sessions] = await Promise.all([
		db.courseChapter.findMany({
			where: { courseId, semesterId },
			orderBy: { order: 'asc' },
			select: { id: true, title: true }
		}),
		db.studySession.findMany({
			where: { courseId, semesterId },
			select: { chapterId: true, studentId: true, durationSeconds: true }
		})
	]);

	interface Acc {
		totalStudySeconds: number;
		students: Set<string>;
	}
	const byChapter = new Map<string | null, Acc>();
	for (const session of sessions) {
		const acc = byChapter.get(session.chapterId) ?? { totalStudySeconds: 0, students: new Set<string>() };
		acc.totalStudySeconds += session.durationSeconds;
		acc.students.add(session.studentId);
		byChapter.set(session.chapterId, acc);
	}

	const result: ChapterBreakdownEntry[] = chapters.map((chapter) => {
		const acc = byChapter.get(chapter.id);
		return {
			chapterId: chapter.id,
			chapterTitle: chapter.title,
			totalStudySeconds: acc?.totalStudySeconds ?? 0,
			studentCount: acc?.students.size ?? 0
		};
	});

	// Chapter-less study time (chapterId: null on the session — either the
	// note itself has no chapter, or the session is against an assignment,
	// which never has one) — only included if it actually happened, so a
	// course with every note chaptered doesn't show a meaningless 0 row.
	const unchaptered = byChapter.get(null);
	if (unchaptered) {
		result.push({
			chapterId: null,
			chapterTitle: null,
			totalStudySeconds: unchaptered.totalStudySeconds,
			studentCount: unchaptered.students.size
		});
	}

	return result;
}

export interface MostLeastStudiedChapter {
	most: ChapterBreakdownEntry | null;
	least: ChapterBreakdownEntry | null;
}

/** Convenience wrapper over computeChapterBreakdown for the "most/least studied chapter" dashboard callout. Only considers chapters that actually have a title (excludes the null/"unchaptered" bucket) and requires at least 2 real chapters for "least" to be meaningful — a 1-chapter course has no "least studied" distinct from "most studied." */
export async function computeMostLeastStudiedChapter(
	courseId: string,
	semesterId: string
): Promise<MostLeastStudiedChapter> {
	const breakdown = (await computeChapterBreakdown(courseId, semesterId)).filter((c) => c.chapterId !== null);
	if (breakdown.length === 0) return { most: null, least: null };

	const sorted = [...breakdown].sort((a, b) => b.totalStudySeconds - a.totalStudySeconds);
	return {
		most: sorted[0],
		least: sorted.length > 1 ? sorted[sorted.length - 1] : null
	};
}

export type TimePeriod = 'today' | 'week' | 'month' | 'custom';

export interface PeriodRange {
	start: Date;
	end: Date;
}

/**
 * Resolves a named period to a concrete [start, end) range, anchored to
 * "now" — 'today' is midnight-to-now, 'week' is the last 7 days, 'month'
 * the last 30. 'custom' requires explicit start/end and is validated by the
 * caller, not here (this function only handles the three named cases).
 */
export function resolvePeriod(period: Exclude<TimePeriod, 'custom'>): PeriodRange {
	const end = new Date();
	const start = new Date(end);
	if (period === 'today') {
		start.setHours(0, 0, 0, 0);
	} else if (period === 'week') {
		start.setDate(start.getDate() - 7);
	} else {
		start.setDate(start.getDate() - 30);
	}
	return { start, end };
}

export interface CoursePeriodStats {
	courseId: string;
	courseName: string;
	totalStudySeconds: number;
	activeStudentCount: number;
}

/**
 * Per-course totals within a time window, for the Instructor analytics
 * endpoint's all-courses view (plans.txt §37). Restricted to `courseIds`
 * (the instructor's assigned courses) rather than every course, so this
 * doubles as the scoping mechanism, not just a convenience filter.
 */
export async function computeCoursePeriodStats(
	courseIds: string[],
	semesterId: string,
	range: PeriodRange
): Promise<CoursePeriodStats[]> {
	if (courseIds.length === 0) return [];

	const [courses, sessions] = await Promise.all([
		db.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true } }),
		db.studySession.findMany({
			where: {
				courseId: { in: courseIds },
				semesterId,
				startedAt: { gte: range.start, lte: range.end }
			},
			select: { courseId: true, studentId: true, durationSeconds: true }
		})
	]);

	interface Acc {
		totalStudySeconds: number;
		students: Set<string>;
	}
	const byCourse = new Map<string, Acc>();
	for (const session of sessions) {
		const acc = byCourse.get(session.courseId) ?? { totalStudySeconds: 0, students: new Set<string>() };
		acc.totalStudySeconds += session.durationSeconds;
		acc.students.add(session.studentId);
		byCourse.set(session.courseId, acc);
	}

	return courses.map((course) => {
		const acc = byCourse.get(course.id);
		return {
			courseId: course.id,
			courseName: course.name,
			totalStudySeconds: acc?.totalStudySeconds ?? 0,
			activeStudentCount: acc?.students.size ?? 0
		};
	});
}

export interface StudentStudySummary {
	thisWeekSeconds: number;
	coursesStudiedThisWeek: number;
	mostStudiedCourse: { courseId: string; courseName: string; seconds: number } | null;
	/** Consecutive days (ending today or yesterday) with at least one StudySession. 0 if nothing logged today or yesterday. */
	currentStreakDays: number;
}

/**
 * The single number set a student's home dashboard needs (plans.txt §15):
 * this week's total, how many courses touched, the standout course, and a
 * day streak. Streak is computed from distinct calendar dates with any
 * activity across the whole semester (not just this week) — a student who
 * studied every day for the last 10 days has a 10-day streak even though
 * "this week" only covers 7 of them.
 */
export async function computeStudentStudySummary(
	studentId: string,
	semesterId: string
): Promise<StudentStudySummary> {
	const weekRange = resolvePeriod('week');

	const [weekSessions, allSessions] = await Promise.all([
		db.studySession.findMany({
			where: { studentId, semesterId, startedAt: { gte: weekRange.start, lte: weekRange.end } },
			select: { courseId: true, durationSeconds: true, course: { select: { name: true } } }
		}),
		// Only the dates are needed for streak — semester-wide, not
		// week-bounded, per the comment above.
		db.studySession.findMany({
			where: { studentId, semesterId },
			select: { startedAt: true },
			orderBy: { startedAt: 'desc' }
		})
	]);

	let thisWeekSeconds = 0;
	const courseSeconds = new Map<string, { courseName: string; seconds: number }>();
	for (const s of weekSessions) {
		thisWeekSeconds += s.durationSeconds;
		const entry = courseSeconds.get(s.courseId) ?? { courseName: s.course.name, seconds: 0 };
		entry.seconds += s.durationSeconds;
		courseSeconds.set(s.courseId, entry);
	}

	let mostStudiedCourse: StudentStudySummary['mostStudiedCourse'] = null;
	for (const [courseId, entry] of courseSeconds) {
		if (!mostStudiedCourse || entry.seconds > mostStudiedCourse.seconds) {
			mostStudiedCourse = { courseId, courseName: entry.courseName, seconds: entry.seconds };
		}
	}

	// Distinct calendar dates (local to the server — acceptable for a
	// day-streak feature at this scale), most recent first.
	const distinctDates = Array.from(
		new Set(allSessions.map((s) => s.startedAt.toISOString().slice(0, 10)))
	).sort((a, b) => (a < b ? 1 : -1));

	let currentStreakDays = 0;
	if (distinctDates.length > 0) {
		const today = new Date().toISOString().slice(0, 10);
		const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
		const mostRecent = distinctDates[0];

		if (mostRecent === today || mostRecent === yesterday) {
			currentStreakDays = 1;
			let cursor = new Date(mostRecent);
			for (let i = 1; i < distinctDates.length; i++) {
				cursor.setDate(cursor.getDate() - 1);
				const expected = cursor.toISOString().slice(0, 10);
				if (distinctDates[i] === expected) {
					currentStreakDays += 1;
				} else {
					break;
				}
			}
		}
	}

	return {
		thisWeekSeconds,
		coursesStudiedThisWeek: courseSeconds.size,
		mostStudiedCourse,
		currentStreakDays
	};
}
