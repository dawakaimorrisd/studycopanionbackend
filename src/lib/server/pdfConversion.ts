import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class PdfConversionError extends Error {}

const DOCX_MIME_TYPE =
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const PDF_MIME_TYPE = 'application/pdf';

/**
 * Converts an uploaded document into the PDF that the frontend should read.
 *
 * Rules:
 * - PDF upload → returned unchanged.
 * - DOCX upload → converted using LibreOffice/soffice.
 * - Nothing else → rejected.
 *
 * IMPORTANT:
 * This function is intended to run inside the background worker.
 * It should NOT be called from a Netlify/serverless request handler because
 * LibreOffice is a system dependency and conversion can be expensive.
 */
export async function ensurePdf(params: {
	sourceBuffer: Buffer;
	sourceMimeType?: string | null;
	fileName?: string | null;
	rawText?: string;
}): Promise<Buffer> {
	const { sourceBuffer, sourceMimeType, fileName } = params;

	if (!sourceBuffer || sourceBuffer.length === 0) {
		throw new PdfConversionError('The source document is empty.');
	}

	// A PDF is already the canonical browser-readable version.
	// Never re-render or modify it here.
	if (sourceMimeType === PDF_MIME_TYPE) {
		return sourceBuffer;
	}

	// Only DOCX needs conversion.
	if (sourceMimeType !== DOCX_MIME_TYPE) {
		throw new PdfConversionError(
			`Cannot convert "${sourceMimeType || 'unknown'}" to PDF. Only PDF and DOCX files are supported.`
		);
	}

	return convertDocxToPdf(
		sourceBuffer,
		fileName || 'document.docx'
	);
}

/**
 * Converts a DOCX buffer to PDF using LibreOffice in headless mode.
 *
 * The conversion happens entirely in a temporary directory.
 * The original DOCX remains untouched.
 */
async function convertDocxToPdf(
	sourceBuffer: Buffer,
	fileName: string
): Promise<Buffer> {
	const workingDirectory = await mkdtemp(
		join(tmpdir(), 'assignment-docx-to-pdf-')
	);

	try {
		const inputFileName = makeSafeDocxFileName(fileName);
		const inputPath = join(workingDirectory, inputFileName);

		await writeFile(inputPath, sourceBuffer);

		/*
		 * Allow the worker host to specify the LibreOffice binary.
		 *
		 * Linux normally exposes it as:
		 *   soffice
		 *
		 * Some installations may use:
		 *   libreoffice
		 */
		const sofficePath =
			process.env.SOFFICE_PATH?.trim() || 'soffice';

		await execFileAsync(
			sofficePath,
			[
				'--headless',
				'--convert-to',
				'pdf:writer_pdf_Export',
				'--outdir',
				workingDirectory,
				inputPath
			],
			{
				timeout: 120_000,
				maxBuffer: 10 * 1024 * 1024
			}
		);

		const pdfFileName = `${basename(
			inputFileName,
			extname(inputFileName)
		)}.pdf`;

		const pdfPath = join(workingDirectory, pdfFileName);

		const pdfBuffer = await readFile(pdfPath);

		if (!pdfBuffer.length) {
			throw new PdfConversionError(
				'LibreOffice produced an empty PDF.'
			);
		}

		return pdfBuffer;
	} catch (error) {
		if (error instanceof PdfConversionError) {
			throw error;
		}

		const message =
			error instanceof Error ? error.message : String(error);

		throw new PdfConversionError(
			`DOCX to PDF conversion failed: ${message}`
		);
	} finally {
		// Always remove temporary DOCX/PDF files.
		await rm(workingDirectory, {
			recursive: true,
			force: true
		}).catch(() => {
			// Cleanup failure should not hide the original conversion result.
		});
	}
}

/**
 * Prevents arbitrary paths from being passed to LibreOffice.
 *
 * We deliberately give the temporary input a simple .docx filename.
 */
function makeSafeDocxFileName(fileName: string): string {
	const originalBaseName = basename(fileName || 'document.docx');

	const withoutExtension = originalBaseName
		.replace(/\.[^.]+$/, '')
		.replace(/[^a-zA-Z0-9._-]/g, '_')
		.slice(0, 100);

	return `${withoutExtension || 'document'}.docx`;
}