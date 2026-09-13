import { db } from '$lib/server/db';
import { storage } from '$lib/server/storage';
import { extractTextFromFile } from '$lib/server/parseFile';
import { runGeneration } from '$lib/server/generation/generate';

export async function processNote(
	noteId: string
): Promise<void> {
	console.log(
		`[note-processor] Starting note ${noteId}`
	);

	const note = await db.note.findUnique({
		where: { id: noteId }
	});

	if (!note) {
		throw new Error(
			`Note ${noteId} was not found.`
		);
	}

	try {
		/*
		 * Pasted text:
		 *
		 * rawText already exists, so there is no extraction step.
		 *
		 * Uploaded file:
		 *
		 * sourceFileUrl points to the original canonical file.
		 * We read it and extract its text here in the worker.
		 */
		if (
			note.sourceFileUrl &&
			note.sourceFileMimeType
		) {
			const sourceBuffer = await storage.read(
				note.sourceFileUrl
			);

			if (
				!sourceBuffer ||
				sourceBuffer.length === 0
			) {
				throw new Error(
					'The uploaded note file is empty or could not be read.'
				);
			}

			const rawText =
				await extractTextFromFile(
					sourceBuffer,
					note.sourceFileMimeType
				);

			const cleanedText = rawText.trim();

			if (!cleanedText) {
				throw new Error(
					'No readable text could be extracted from the note file.'
				);
			}

			await db.note.update({
				where: { id: noteId },
				data: {
					rawText: cleanedText
				}
			});

			console.log(
				`[note-processor] Text extracted for ${noteId}`
			);
		} else if (!note.rawText.trim()) {
			throw new Error(
				'The note has neither pasted text nor an uploaded source file.'
			);
		}

		/*
		 * AI generation happens here after the content is ready.
		 *
		 * Notes do NOT go through PDF conversion.
		 */
		await runGeneration(
			'NOTE',
			noteId
		);

		console.log(
			`[note-processor] Note ${noteId} completed`
		);
	} catch (error) {
		console.error(
			`[note-processor] Note ${noteId} failed:`,
			error
		);

		throw error;
	}
}