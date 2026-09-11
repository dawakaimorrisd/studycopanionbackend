import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin, requireAdminOrModerator } from '$lib/server/auth/permissions';
import { getActiveSemester } from '$lib/server/access/semester';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdminOrModerator(locals.staff);

	const semester = await getActiveSemester();
	const collegeId = url.searchParams.get('collegeId') ?? undefined;

	const [students, colleges] = await Promise.all([
		db.student.findMany({
			where: { deletedAt: null, collegeId },
			orderBy: { name: 'asc' },
			include: {
				college: { select: { name: true } },
				// Phase 10+: this used to count NoteAccess/AssignmentAccess grant
				// rows (both tables removed). courseEnrollments, scoped to the
				// active semester, is the equivalent "how much is this student set
				// up to see right now" signal.
				_count: { select: { courseEnrollments: { where: { semesterId: semester.id } } } }
			}
		}),
		db.college.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
	]);

	return { students, colleges, selectedCollegeId: collegeId ?? '', semester: { id: semester.id, name: semester.name } };
};

export const actions: Actions = {
	// Note: students self-register from the Frontend (name + studentCode) —
	// there's no console creation form here on purpose, per the plan
	// ("fully manual, no pre-provisioned roster, no bulk import").
	deleteStudent: async ({ request, locals }) => {
		// Only Admin can delete a student — Moderator has full day-to-day
		// content power but not this.
		requireAdmin(locals.staff);
		const formData = await request.formData();
		const studentId = String(formData.get('studentId') ?? '');
		if (!studentId) return fail(400, { error: 'Missing student id.' });

		await db.student.update({ where: { id: studentId }, data: { deletedAt: new Date() } });
		await db.studentSession.deleteMany({ where: { studentId } });

		return { success: true };
	}
};
