import { db } from '$lib/server/db';
import { storage } from '$lib/server/storage';
import { extractTextFromFile } from '$lib/server/parseFile';
import { ensurePdf, PdfConversionError } from '$lib/server/pdfConversion';
import { runGeneration } from '$lib/server/generation/generate';

const PDF_MIME_TYPE = 'application/pdf';

/**
 * Processes an uploaded Assignment in the background.
 *
 * Assignment processing is intentionally separate from Note processing.
 *
 * Responsibilities:
 * 1. Read the original uploaded file.
 * 2. Extract raw text for AI processing.
 * 3. Ensure a browser-readable PDF exists.
 * 4. Reuse the original URL when the upload is already a PDF.
 * 5. Convert DOCX → PDF using LibreOffice when necessary.
 * 6. Save the generated PDF.
 * 7. Run AI generation.
 */
export async function processAssignment(
	assignmentId: string
): Promise<void> {
	console.log(
		`[assignment-processor] Starting assignment ${assignmentId}`
	);

	const assignment = await db.assignment.findUnique({
		where: { id: assignmentId }
	});

	if (!assignment) {
		throw new Error(
			`Assignment ${assignmentId} was not found.`
		);
	}

	try {
		/*
		 * -------------------------------------------------------------
		 * STEP 1 — Read the canonical uploaded file
		 * -------------------------------------------------------------
		 *
		 * fileUrl always points to the original upload.
		 */
		const sourceBuffer = await storage.read(
			assignment.fileUrl
		);

		if (!sourceBuffer || sourceBuffer.length === 0) {
			throw new Error(
				'The original assignment file is empty or could not be read.'
			);
		}

		/*
		 * -------------------------------------------------------------
		 * STEP 2 — Extract text for AI
		 * -------------------------------------------------------------
		 *
		 * DOCX → Mammoth → rawText
		 * PDF  → pdf-parse → rawText
		 *
		 * This is independent from PDF generation.
		 */
		let rawText: string;

		try {
			rawText = await extractTextFromFile(
				sourceBuffer,
				assignment.fileMimeType || ''
			);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: String(error);

			throw new Error(
				`Assignment text extraction failed: ${message}`
			);
		}

		rawText = rawText.trim();

		if (!rawText) {
			throw new Error(
				'No readable text could be extracted from the assignment file.'
			);
		}

		/*
		 * Save extracted text before PDF conversion.
		 *
		 * This is useful because rawText is an independent AI-processing
		 * result. If PDF conversion fails, the extracted text is still
		 * available on the Assignment.
		 */
		await db.assignment.update({
			where: { id: assignmentId },
			data: {
				rawText
			}
		});

		console.log(
			`[assignment-processor] Text extracted for ${assignmentId}`
		);

		/*
		 * -------------------------------------------------------------
		 * STEP 3 — Handle the PDF version
		 * -------------------------------------------------------------
		 *
		 * If the original upload is already a PDF:
		 *
		 *     fileUrl === pdfUrl
		 *
		 * No duplicate file is created.
		 *
		 * If the original upload is DOCX:
		 *
		 *     DOCX → LibreOffice → PDF
		 */
		if (assignment.fileMimeType === PDF_MIME_TYPE) {
			await db.assignment.update({
				where: { id: assignmentId },
				data: {
					pdfUrl: assignment.fileUrl,
					pdfConversionError: null
				}
			});

			console.log(
				`[assignment-processor] Original PDF reused for ${assignmentId}`
			);
		} else {
			let pdfBuffer: Buffer;

			try {
				pdfBuffer = await ensurePdf({
					sourceBuffer,
					sourceMimeType: assignment.fileMimeType,
					fileName: assignment.fileName,
					rawText
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: String(error);

				console.error(
					`[assignment-processor] PDF conversion failed for ${assignmentId}:`,
					error
				);

				await db.assignment.update({
					where: { id: assignmentId },
					data: {
						pdfConversionError: message
					}
				});

				if (error instanceof PdfConversionError) {
					throw error;
				}

				throw new PdfConversionError(message);
			}

			/*
			 * Save the generated PDF separately from the original DOCX.
			 */
			const pdfFileName = makePdfFileName(
				assignment.fileName
			);

			const { url: pdfUrl } = await storage.save({
				buffer: pdfBuffer,
				name: pdfFileName,
				mimeType: PDF_MIME_TYPE
			});

			await db.assignment.update({
				where: { id: assignmentId },
				data: {
					pdfUrl,
					pdfConversionError: null
				}
			});

			console.log(
				`[assignment-processor] DOCX converted to PDF for ${assignmentId}`
			);
		}

		/*
		 * -------------------------------------------------------------
		 * STEP 4 — AI generation
		 * -------------------------------------------------------------
		 *
		 * runGeneration() reads Assignment.rawText.
		 *
		 * The upload request is already finished by this point.
		 * Redis/BullMQ is responsible for running this work in the
		 * background.
		 */
		console.log(
			`[assignment-processor] Starting AI generation for ${assignmentId}`
		);

		await runGeneration(
			'ASSIGNMENT',
			assignmentId
		);

		console.log(
			`[assignment-processor] Assignment ${assignmentId} completed`
		);
	} catch (error) {
  console.error(
    `[assignment-processor] Assignment ${assignmentId} failed:`,
    error
  );

  const message =
    error instanceof Error ? error.message : String(error);

  await db.assignment.update({
    where: { id: assignmentId },
    data: {
      processingStatus: 'FAILED',
      generationError: message
    }
  });

  throw error;
}
/**
 * Converts:
 *
 *   homework.docx
 *
 * into:
 *
 *   homework.pdf
 */
function makePdfFileName(fileName: string): string {
	const withoutExtension = fileName
		.replace(/\.[^/.]+$/, '')
		.trim();

	return `${withoutExtension || 'assignment'}.pdf`;
}
}