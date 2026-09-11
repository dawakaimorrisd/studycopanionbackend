import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { resolveUploadedContent, ContentUploadError } from '$lib/server/contentUpload';
import { getActiveSemester } from '$lib/server/access/semester';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdminOrModerator(locals.staff);

	const semester = await getActiveSemester();
	const courses = await db.course.findMany({
		orderBy: { name: 'asc' },
		select: { id: true, name: true, courseCode: true }
	});
	const chapters = await db.courseChapter.findMany({
		where: { semesterId: semester.id },
		orderBy: [{ courseId: 'asc' }, { order: 'asc' }],
		select: { id: true, title: true, courseId: true }
	});

	return { courses, chapters, semester: { id: semester.id, name: semester.name } };
};

const metaSchema = z.object({
	courseId: z.string().min(1, 'Choose a course.'),
	title: z.string().trim().optional(),
	chapterLabel: z.string().trim().optional(),
	chapterId: z.string().trim().optional()
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const staff = requireAdminOrModerator(locals.staff);
		const semester = await getActiveSemester();

		const formData = await request.formData();
		const parsedMeta = metaSchema.safeParse({
			courseId: formData.get('courseId'),
			title: formData.get('title'),
			chapterLabel: formData.get('chapterLabel'),
			chapterId: formData.get('chapterId')
		});
		if (!parsedMeta.success) {
			return fail(400, { error: parsedMeta.error.issues[0].message });
		}

		let content;
		try {
			content = await resolveUploadedContent(formData);
		} catch (err) {
			if (err instanceof ContentUploadError) {
				return fail(400, { error: err.message });
			}
			throw err;
		}

		const note = await db.note.create({
			data: {
				courseId: parsedMeta.data.courseId,
				semesterId: semester.id,
				chapterId: parsedMeta.data.chapterId || null,
				title: parsedMeta.data.title || null,
				chapterLabel: parsedMeta.data.chapterLabel || null,
				rawText: content.rawText,
				sourceFileUrl: content.sourceFileUrl,
				sourceFileName: content.sourceFileName,
				sourceFileMimeType: content.sourceFileMimeType,
				uploadedByStaffId: staff.id
			}
		});

		throw redirect(303, `/console/notes/${note.id}`);
	}
};
