import { error, json } from '@sveltejs/kit';
import { requireAdminOrModerator } from '$lib/server/auth/permissions';
import { db } from '$lib/server/db';
import { storage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireAdminOrModerator(locals.staff);

	const assignment = await db.assignment.findUnique({
		where: { id: params.id },
		select: {
			pdfUrl: true,
			fileName: true,
			processingStatus: true,
			pdfConversionError: true,
			generationError: true
		}
	});

	if (!assignment) {
		throw error(404, 'Assignment not found.');
	}

	if (assignment.processingStatus === 'PROCESSING') {
		return json(
			{
				status: 'PROCESSING',
				message: 'Assignment is still being processed.'
			},
			{ status: 202 }
		);
	}

	if (assignment.processingStatus === 'FAILED') {
		return json(
			{
				status: 'FAILED',
				message:
					assignment.pdfConversionError ??
					assignment.generationError ??
					'Assignment processing failed.'
			},
			{ status: 500 }
		);
	}

	if (assignment.processingStatus !== 'READY') {
		throw error(409, 'Assignment is not ready.');
	}

	if (!assignment.pdfUrl) {
		throw error(404, 'Processed PDF not found.');
	}

	try {
		const buffer = await storage.read(assignment.pdfUrl);

		if (!buffer || buffer.length === 0) {
			throw error(404, 'Processed PDF is empty or unavailable.');
		}

		return new Response(new Uint8Array(buffer), {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="${encodeURIComponent(
					assignment.fileName?.replace(/\.[^/.]+$/, '') ||
						'assignment'
				)}.pdf"`,
				'Cache-Control': 'private, max-age=300'
			}
		});
	} catch (err) {
		if (
			err &&
			typeof err === 'object' &&
			'status' in err
		) {
			throw err;
		}

		throw error(404, 'Unable to read processed assignment PDF.');
	}
};