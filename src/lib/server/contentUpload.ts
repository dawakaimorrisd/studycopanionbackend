import {
	extractTextFromFile,
	isSupportedUploadType
} from '$lib/server/parseFile';

import { storage } from '$lib/server/storage';

export interface ResolvedContent {
	rawText: string;
	sourceFileUrl: string | null;
	sourceFileName: string | null;
	sourceFileMimeType: string | null;
}

export class ContentUploadError extends Error {}

export async function resolveUploadedContent(
	formData: FormData
): Promise<ResolvedContent> {
	const pastedTextRaw =
		formData.get('pastedText');

	const pastedText =
		typeof pastedTextRaw === 'string'
			? pastedTextRaw.trim()
			: '';

	const file = formData.get('file');

	const hasFile =
		file instanceof File &&
		file.size > 0;

	if (pastedText && hasFile) {
		throw new ContentUploadError(
			'Provide either pasted text or a file, not both.'
		);
	}

	if (pastedText) {
		return {
			rawText: pastedText,
			sourceFileUrl: null,
			sourceFileName: null,
			sourceFileMimeType: null
		};
	}

	if (hasFile) {
		const uploadedFile = file as File;

		if (
			!isSupportedUploadType(
				uploadedFile.type
			)
		) {
			throw new ContentUploadError(
				`Unsupported file type "${uploadedFile.type || 'unknown'}". Upload a PDF or DOCX, or paste text instead.`
			);
		}

		const buffer = Buffer.from(
			await uploadedFile.arrayBuffer()
		);

		/*
		 * The file is stored now.
		 *
		 * Text extraction happens in noteProcessor.ts.
		 */
		const { url } = await storage.save({
			buffer,
			name: uploadedFile.name,
			mimeType: uploadedFile.type
		});

		return {
			rawText: '',
			sourceFileUrl: url,
			sourceFileName: uploadedFile.name,
			sourceFileMimeType: uploadedFile.type
		};
	}

	throw new ContentUploadError(
		'Paste text or upload a PDF/DOCX file.'
	);
}