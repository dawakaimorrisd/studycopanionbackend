// Console-side twin of GET /api/v1/instructors/notes/:id/results — same
// shape and same "not gated by reveal state" rule (Admin/Moderator, like
// Instructor, see everything regardless — the reveal gate is for students
// only), just reached via direct Prisma per console convention (see
// BACKEND_BUILD_PLAN.md §3) instead of the bearer-token API.
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { eligibleStudentsForCourse } from '$lib/server/access/course';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

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
			questionUnits: { select: { id: true } }
		}
	});
	if (!note) throw error(404, 'Note not found.');

	const [attempts, eligibleStudents] = await Promise.all([
		db.noteTestAttempt.findMany({
			where: { noteId: note.id },
			select: { studentId: true, score: true, submittedAt: true }
		}),
		eligibleStudentsForCourse(note.courseId, note.semesterId)
	]);
	const attemptByStudentId = new Map(attempts.map((a) => [a.studentId, a]));

	const submitted: Array<{
		studentId: string;
		studentName: string;
		studentCode: string;
		score: number;
		submittedAt: Date;
	}> = [];
	const notYetSubmitted: Array<{ studentId: string; studentName: string; studentCode: string }> = [];

	for (const student of eligibleStudents) {
		const attempt = attemptByStudentId.get(student.id);
		if (attempt) {
			submitted.push({
				studentId: student.id,
				studentName: student.name,
				studentCode: student.studentCode,
				score: attempt.score,
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

	return {
		note: { id: note.id, title: note.title, chapterLabel: note.chapterLabel, totalQuestions: note.questionUnits.length, testStartedAt: note.testStartedAt, testRevealedAt: note.testRevealedAt },
		submitted,
		notYetSubmitted
	};
};
