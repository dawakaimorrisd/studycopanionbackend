import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import { computeCourseProgress, computeChapterTestScores } from '$lib/server/analytics/courseProgress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

	const course = await db.course.findUnique({
		where: { id: params.courseId },
		select: { id: true, name: true, courseCode: true }
	});
	if (!course) throw error(404, 'Course not found.');

	const semester = await getActiveSemester();

	// Phase 13, corrected per product clarification: no separate aggregate
	// chapter-breakdown query here anymore (see courseProgress.ts's
	// MostStudiedContent.chapterTitle comment for why) — chapter context is
	// now folded directly into each student's row via
	// lastStudiedChapterTitle / mostStudiedContent.chapterTitle instead of a
	// standalone dashboard section.
	const [progress, chapterTests] = await Promise.all([
		computeCourseProgress(params.courseId, semester.id),
		computeChapterTestScores(params.courseId, semester.id)
	]);

	// Most-engaged first is a reasonable default read order; still sortable
	// by any column client-side if needed later.
	const order = { engaged: 0, moderate: 1, 'at-risk': 2 } as const;
	progress.sort((a, b) => order[a.engagement] - order[b.engagement]);

	// v9 amendment: merge in each student's chapter test history — the same
	// additive signal Instructors already get via their "my students" API,
	// now also on the Admin/Moderator console view for this course.
	const chapterTestsByStudentId = new Map(chapterTests.map((c) => [c.studentId, c.chapterTests]));
	const progressWithTests = progress.map((p) => ({
		...p,
		chapterTests: chapterTestsByStudentId.get(p.studentId) ?? []
	}));

	return {
		course,
		semester: { id: semester.id, name: semester.name },
		progress: progressWithTests
	};
};
