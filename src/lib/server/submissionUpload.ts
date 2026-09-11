// Resolves the uploaded file for a student-created Assignment (the unified
// Assignment/submission model — see schema.prisma). Deliberately NOT
// contentUpload.ts's resolveUploadedContent: that helper allows "pasted
// text instead of a file," which doesn't apply here —
// Assignment.fileUrl/fileName are required, non-nullable fields
// (see schema.prisma), a submission is always an actual file. Reuses the
// same storage/parseFile primitives Note/Assignment upload already uses
// (see storage.ts — local disk by default, Cloudinary opt-in via
// STORAGE_PROVIDER=cloudinary; see that file's LocalFileStorage comment
// for why Cloudinary is required for any real multi-instance deployment).
//
// Unlike Note/Assignment upload, a failed text extraction does NOT reject
// the submission — the instructor still needs to see what was submitted
// even if it can't be parsed for generation. rawText is simply left null in
// that case; the group can still exist, just can't generate drills from it
// until re-submitted with a parseable file.
//
// ALSO produces pdfUrl now (see pdfConversion.ts) — the file both the
// submitter and the Instructor/Admin/Moderator actually read. A PDF
// rendering failure does NOT reject the submission either, same
// reasoning as a text-extraction failure — pdfConversionError records it
// instead, and the original fileUrl/fileName are still saved so nothing
// is lost.
import { extractTextFromFile, isSupportedUploadType } from '$lib/server/parseFile';
import { storage } from '$lib/server/storage';
import { ensurePdf, PdfConversionError } from '$lib/server/pdfConversion';

export interface ResolvedSubmissionFile {
	fileUrl: string;
	fileName: string;
	fileMimeType: string;
	rawText: string | null;
	pdfUrl: string | null;
	pdfConversionError: string | null;
}

export class SubmissionUploadError extends Error {}

export async function resolveSubmissionFile(formData: FormData): Promise<ResolvedSubmissionFile> {
	const file = formData.get('file');
	if (!(file instanceof File) || file.size === 0) {
		throw new SubmissionUploadError('Upload a PDF or DOCX file.');
	}

	if (!isSupportedUploadType(file.type)) {
		throw new SubmissionUploadError(`Unsupported file type "${file.type || 'unknown'}". Upload a PDF or DOCX.`);
	}

	const buffer = Buffer.from(await file.arrayBuffer());

	let rawText: string | null = null;
	try {
		rawText = (await extractTextFromFile(buffer, file.type)) || null;
	} catch {
		// See file-top comment — parsing failure doesn't reject the
		// submission, it just means generation won't be available for it
		// until re-submitted.
		rawText = null;
	}

	const { url } = await storage.save({ buffer, name: file.name, mimeType: file.type });

	let pdfUrl: string | null = null;
	let pdfConversionError: string | null = null;
	try {
		const pdfBuffer = await ensurePdf({ rawText: rawText ?? '', sourceBuffer: buffer, sourceMimeType: file.type });
		const saved = await storage.save({
			buffer: pdfBuffer,
			name: file.name.replace(/\.[^.]+$/, '') + '.pdf',
			mimeType: 'application/pdf'
		});
		pdfUrl = saved.url;
	} catch (err) {
		pdfConversionError = err instanceof PdfConversionError ? err.message : 'PDF rendering failed.';
	}

	return { fileUrl: url, fileName: file.name, fileMimeType: file.type, rawText, pdfUrl, pdfConversionError };
}
