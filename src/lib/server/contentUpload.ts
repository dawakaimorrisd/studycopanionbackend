// Shared by the console upload form action and the Instructor API upload
// route (Phase 6) — both need "take either pasted text or a file, end up
// with rawText plus optional source-file metadata," and this is the one
// place that logic lives.
import { extractTextFromFile, isSupportedUploadType } from '$lib/server/parseFile';
import { storage } from '$lib/server/storage';
import { ensurePdf, PdfConversionError } from '$lib/server/pdfConversion';

export interface ResolvedContent {
	rawText: string;
	sourceFileUrl: string | null;
	sourceFileName: string | null;
	sourceFileMimeType: string | null;
}

export class ContentUploadError extends Error {}

/**
 * Reads `pastedText` and `file` fields off a FormData. Exactly one must be
 * present and non-empty — enforced here so every caller gets the same
 * error message instead of drifting.
 */
export async function resolveUploadedContent(formData: FormData): Promise<ResolvedContent> {
	const pastedTextRaw = formData.get('pastedText');
	const pastedText = typeof pastedTextRaw === 'string' ? pastedTextRaw.trim() : '';
	const file = formData.get('file');
	const hasFile = file instanceof File && file.size > 0;

	if (pastedText && hasFile) {
		throw new ContentUploadError('Provide either pasted text or a file, not both.');
	}

	if (pastedText) {
		return { rawText: pastedText, sourceFileUrl: null, sourceFileName: null, sourceFileMimeType: null };
	}

	if (hasFile) {
		const uploadedFile = file as File;
		if (!isSupportedUploadType(uploadedFile.type)) {
			throw new ContentUploadError(
				`Unsupported file type "${uploadedFile.type || 'unknown'}". Upload a PDF or DOCX, or paste text instead.`
			);
		}

		const buffer = Buffer.from(await uploadedFile.arrayBuffer());
		const rawText = await extractTextFromFile(buffer, uploadedFile.type);

		if (!rawText) {
			throw new ContentUploadError(
				"Couldn't extract any text from that file — it may be a scanned/image-only document."
			);
		}

		const { url } = await storage.save({
			buffer,
			name: uploadedFile.name,
			mimeType: uploadedFile.type
		});

		return {
			rawText,
			sourceFileUrl: url,
			sourceFileName: uploadedFile.name,
			sourceFileMimeType: uploadedFile.type
		};
	}

	throw new ContentUploadError('Paste text or upload a PDF/DOCX file.');
}

export interface ResolvedAssignmentContent extends ResolvedContent {
	pdfUrl: string | null;
	pdfConversionError: string | null;
}

/**
 * Assignment-specific wrapper over resolveUploadedContent, above — adds a
 * pdfUrl (see pdfConversion.ts), always produced regardless of whether the
 * source was pasted text or an uploaded file. Notes never call this;
 * they use resolveUploadedContent directly and have no pdfUrl concept —
 * Notes keep their structured, generated reading experience, Assignments
 * are PDF-first (per direct product decision, see schema.prisma's
 * Assignment comment). A PDF rendering failure does NOT reject the
 * upload — pdfConversionError records it, generation from rawText still
 * proceeds normally either way.
 */
export async function resolveAssignmentContent(formData: FormData): Promise<ResolvedAssignmentContent> {
	const content = await resolveUploadedContent(formData);

	let sourceBuffer: Buffer | undefined;
	if (content.sourceFileUrl && content.sourceFileMimeType === 'application/pdf') {
		// Only needed for the "already a PDF, pass through unchanged" case —
		// ensurePdf ignores sourceBuffer entirely for a DOCX/pasted-text
		// source, so skip this round-trip to storage unless it's actually a
		// PDF. The file was already uploaded to storage inside
		// resolveUploadedContent above (to get sourceFileUrl); re-read it
		// here rather than plumb the raw buffer through ResolvedContent's
		// public shape, which Notes also use and shouldn't need to carry a
		// buffer through.
		try {
			sourceBuffer = await storage.read(content.sourceFileUrl);
		} catch {
			sourceBuffer = undefined;
		}
	}

	let pdfUrl: string | null = null;
	let pdfConversionError: string | null = null;
	try {
		const pdfBuffer = await ensurePdf({
			rawText: content.rawText,
			sourceBuffer,
			sourceMimeType: content.sourceFileMimeType
		});
		const saved = await storage.save({
			buffer: pdfBuffer,
			name: (content.sourceFileName ?? 'assignment').replace(/\.[^.]+$/, '') + '.pdf',
			mimeType: 'application/pdf'
		});
		pdfUrl = saved.url;
	} catch (err) {
		pdfConversionError = err instanceof PdfConversionError ? err.message : 'PDF rendering failed.';
	}

	return { ...content, pdfUrl, pdfConversionError };
}
