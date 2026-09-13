import { isSupportedUploadType } from '$lib/server/parseFile';
import { storage } from '$lib/server/storage';

export interface ResolvedSubmissionFile {
	fileUrl: string;
	fileName: string;
	fileMimeType: string;
}

export class SubmissionUploadError
	extends Error {}

export async function resolveSubmissionFile(
	formData: FormData
): Promise<ResolvedSubmissionFile> {
	const file = formData.get('file');

	if (
		!(file instanceof File) ||
		file.size === 0
	) {
		throw new SubmissionUploadError(
			'Upload a PDF or DOCX file.'
		);
	}

	if (!isSupportedUploadType(file.type)) {
		throw new SubmissionUploadError(
			`Unsupported file type "${file.type || 'unknown'}". Upload a PDF or DOCX.`
		);
	}

	const buffer = Buffer.from(
		await file.arrayBuffer()
	);

	const { url } = await storage.save({
		buffer,
		name: file.name,
		mimeType: file.type
	});

	return {
		fileUrl: url,
		fileName: file.name,
		fileMimeType: file.type
	};
}