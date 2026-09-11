import { error } from '@sveltejs/kit';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { db } from '$lib/server/db';
import { storage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

	const note = await db.note.findUnique({
		where: { id: params.id },
		select: {
			sourceFileUrl: true,
			sourceFileName: true,
			sourceFileMimeType: true
		}
	});

	if (!note?.sourceFileUrl) {
		throw error(404, 'File not found.');
	}

	try {
		const buffer = await storage.read(note.sourceFileUrl);

		return new Response(new Uint8Array(buffer), {
			headers: {
				'Content-Type': note.sourceFileMimeType ?? 'application/octet-stream',
				'Content-Disposition': `inline; filename="${encodeURIComponent(note.sourceFileName ?? 'file')}"`
			}
		});
	} catch {
		throw error(404, 'File not found.');
	}
};
