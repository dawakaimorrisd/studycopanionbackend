// Server-side parsing of an uploaded file into plain text, written into
// Note/Assignment.rawText. This is cheap, deterministic parsing — not AI —
// so it runs synchronously inline in the upload request (see build plan
// §6), never through the generation pipeline.
import mammoth from 'mammoth';

const SUPPORTED_MIME_TYPES = [
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
] as const;

export function isSupportedUploadType(mimeType: string): boolean {
	return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export async function extractTextFromFile(buffer: Buffer, mimeType: string): Promise<string> {
	if (mimeType === 'application/pdf') {
		// Lazy-imported: pdf-parse reads a test fixture off disk at module load
		// time in some versions, which is unnecessary work for requests that
		// upload a .docx instead.
		const { default: pdfParse } = await import('pdf-parse');
		const result = await pdfParse(buffer);
		return result.text.trim();
	}

	if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
		const result = await mammoth.extractRawText({ buffer });
		return result.value.trim();
	}

	throw new Error(`Unsupported file type: ${mimeType}. Supported: PDF, DOCX.`);
}
