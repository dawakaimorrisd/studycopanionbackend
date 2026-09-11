// GET /api/v1/instructors/me/students — "an instructor's students" is
// computed, not stored: the students paid + enrolled (via StudentCourse +
// StudentSemesterAccess) in a course this instructor is assigned to for the
// active semester. Progress here uses the same shared computeCourseProgress
// + classifyEngagement the console dashboard uses (Phase 7), computed
// per-course then merged across this instructor's courses — so the
// thresholds can never drift between the two surfaces.
import { json } from '@sveltejs/kit';
import { instructorCourseIds } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import {
	computeCourseProgress,
	computeChapterTestScores,
	type StudentCourseProgress,
	type ChapterTestScore
} from '$lib/server/analytics/courseProgress';
import { classifyEngagement } from '$lib/server/analytics/engagement';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

interface MergedStudent {
	studentId: string;
	studentName: string;
	studentCode: string;
	totalStudySeconds: number;
	lastStudiedAt: Date | null;
	lastStudiedChapterTitle: string | null;
	mostStudiedContent: StudentCourseProgress['mostStudiedContent'];
	weeklyActivityByDay: number[];
	everOpened: boolean;
	chapterTests: ChapterTestScore[];
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const semester = await getActiveSemester();
	const courseIds = await instructorCourseIds(locals.staff.id, semester.id);
	if (courseIds.length === 0) return json({ students: [] });

	// Reuse the exact same per-course computation the console uses, one
	// course at a time, then merge across however many courses this
	// instructor teaches — deliberately combined into one "my students" view
	// rather than a per-course breakdown, since that's this endpoint's whole
	// purpose (see docs/phases/PHASE_6.md). Notes only — Instructor has no
	// Assignment access, so their progress view must not include
	// Assignment-derived time or titles either.
	const [perCourseResults, perCourseChapterTests] = await Promise.all([
		Promise.all(courseIds.map((id) => computeCourseProgress(id, semester.id, ['NOTE']))),
		Promise.all(courseIds.map((id) => computeChapterTestScores(id, semester.id)))
	]);

	const merged = new Map<string, MergedStudent>();
	for (const courseProgress of perCourseResults) {
		for (const p of courseProgress) {
			const entry = merged.get(p.studentId) ?? {
				studentId: p.studentId,
				studentName: p.studentName,
				studentCode: p.studentCode,
				totalStudySeconds: 0,
				lastStudiedAt: null as Date | null,
				lastStudiedChapterTitle: null as string | null,
				mostStudiedContent: null as StudentCourseProgress['mostStudiedContent'],
				weeklyActivityByDay: [0, 0, 0, 0, 0, 0, 0],
				everOpened: false,
				chapterTests: [] as ChapterTestScore[]
			};

			entry.totalStudySeconds += p.totalStudySeconds;
			if (!entry.lastStudiedAt || (p.lastStudiedAt && p.lastStudiedAt > entry.lastStudiedAt)) {
				entry.lastStudiedAt = p.lastStudiedAt;
				entry.lastStudiedChapterTitle = p.lastStudiedChapterTitle;
			}
			if (!p.neverOpened) entry.everOpened = true;
			if (p.mostStudiedContent && p.mostStudiedContent.seconds > (entry.mostStudiedContent?.seconds ?? 0)) {
				entry.mostStudiedContent = p.mostStudiedContent;
			}
			entry.weeklyActivityByDay = entry.weeklyActivityByDay.map((s, i) => s + p.weeklyActivityByDay[i]);

			merged.set(p.studentId, entry);
		}
	}

	// Chapter test scores — additive signal, not blended into engagement.
	// A student might not be in `merged` yet if their only activity is a
	// test attempt with no logged StudySession, so seed a bare entry here
	// too rather than dropping their scores.
	for (const courseChapterTests of perCourseChapterTests) {
		for (const s of courseChapterTests) {
			const entry = merged.get(s.studentId);
			if (entry) {
				entry.chapterTests.push(...s.chapterTests);
			}
			// If the student has no StudySession-derived entry at all, their
			// name/code aren't available from this query — computeCourseProgress
			// already covers every paid + enrolled student, and a test attempt
			// requires the student to be eligible in the first place, so this
			// branch is unreachable in practice; left unhandled deliberately
			// rather than a second lookup for a case that can't occur.
		}
	}

	return json({
		students: Array.from(merged.values()).map((s) => ({
			id: s.studentId,
			name: s.studentName,
			studentCode: s.studentCode,
			totalStudySeconds: s.totalStudySeconds,
			lastStudiedAt: s.lastStudiedAt,
			lastStudiedChapterTitle: s.lastStudiedChapterTitle,
			mostStudiedContent: s.mostStudiedContent,
			weeklyActivityByDay: s.weeklyActivityByDay,
			engagement: classifyEngagement({ lastStudiedAt: s.lastStudiedAt, neverOpened: !s.everOpened }),
			chapterTests: s.chapterTests.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
		}))
	});
};

