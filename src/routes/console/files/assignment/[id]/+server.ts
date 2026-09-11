import { error } from '@sveltejs/kit';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { db } from '$lib/server/db';
import { storage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

	const assignment = await db.assignment.findUnique({
		where: { id: params.id },
		select: {
			sourceFileUrl: true,
			sourceFileName: true,
			sourceFileMimeType: true
		}
	});

	if (!assignment?.sourceFileUrl) {
		throw error(404, 'File not found.');
	}

	try {
		const buffer = await storage.read(assignment.sourceFileUrl);

		return new Response(new Uint8Array(buffer), {
			headers: {
				'Content-Type': assignment.sourceFileMimeType ?? 'application/octet-stream',
				'Content-Disposition': `inline; filename="${encodeURIComponent(assignment.sourceFileName ?? 'file')}"`
			}
		});
	} catch {
		throw error(404, 'File not found.');
	}
};
