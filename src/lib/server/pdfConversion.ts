// Ensures a PDF exists for anything that needs to be READ as a PDF —
// Assignment source content and AssignmentSubmission uploads. Written per
// direct product decision: Assignments (both the instructor/admin's own
// uploaded question and every student's submitted work) are read as PDF by
// everyone — student and instructor alike — never as the structured
// section-by-section rendering Notes get. This sidesteps a real bug that
// prompted the decision: a browser can't render a raw .docx inline, and
// whatever URL scheme the Frontend was constructing for one 404'd — see
// the note in FRONTEND_HANDOFF_PHASE_10_PLUS.md's PDF section. A PDF opens
// natively in every browser; nothing else needed after this.
//
// HONEST LIMITATION, stated plainly rather than implied: this is NOT a
// pixel-perfect DOCX→PDF conversion. A real one requires either a system
// LibreOffice binary (`soffice --headless --convert-to pdf`) or a paid
// third-party conversion API — neither is available in, or verifiable
// from, the sandbox this was built in, and LibreOffice specifically is a
// poor fit for a typical serverless/edge deploy target (this project's
// `netlify.toml` suggests Netlify Functions, which cannot easily run a
// ~300MB LibreOffice install). What this DOES do: extract the DOCX's text
// (via the same `mammoth` extraction already used for `rawText` — see
// parseFile.ts) and lay it out as a clean, readable, paginated PDF using
// `pdf-lib` (pure JS, no native binary, safe for serverless). Original
// tables/images/precise fonts/complex formatting are NOT preserved — only
// the text content, same text that already goes into `rawText` for
// generation. If pixel-perfect visual fidelity to the original Word
// document is a real requirement, that needs an infrastructure decision
// (a LibreOffice-capable deploy target, or budget for a conversion API)
// that wasn't mine to make unilaterally — flagged here, not silently
// worked around.
//
// A PDF upload never needs this at all — it's already a PDF; this module
// just aliases it as its own "pdf version."
//
// COMPRESSION, per BACKEND_HANDOFF(2).md §2.1: the ask was to run the
// output through Ghostscript (or equivalent) to strip metadata and
// downsample embedded image DPI, since the Frontend now caches every PDF
// it opens as a raw blob in IndexedDB indefinitely — an uncompressed file
// stays large in every browser that ever opened it. **Ghostscript is a
// system binary, not a Node package** — same category of constraint as
// the DOCX-conversion limitation above (can't install/verify a native
// binary in this sandbox, and it's a poor fit for a typical serverless
// deploy target). What's actually done here: `pdf-lib`'s own
// `useObjectStreams: true` save option, which meaningfully reduces file
// size for text-heavy PDFs like the ones this module renders (no embedded
// images to downsample in the first place, since this renders plain text,
// not a visual copy of the original document — see above). For an
// ALREADY-A-PDF upload (passed through unchanged, not rendered by this
// module), no compression is applied at all — that file is exactly what
// the user uploaded. If large already-PDF uploads become a real problem
// for the Frontend's blob-cache storage budget, that needs the same
// infrastructure decision as full DOCX fidelity: a Ghostscript-capable
// deploy target, or a compression API. Flagged, not silently worked
// around.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export class PdfConversionError extends Error {}

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

/**
 * Produces the "read this as PDF" version of an Assignment/Submission's
 * content, regardless of how it arrived:
 *   - Uploaded a PDF file → returned unchanged, no rendering.
 *   - Uploaded a DOCX file → extracted text is rendered into a plain PDF.
 *   - Pasted text (no file at all) → rendered into a plain PDF the same way.
 * `rawText` is always required (the already-extracted/pasted text — see
 * parseFile.ts/contentUpload.ts) since it's the fallback-and-usual path;
 * `sourceBuffer`/`sourceMimeType` are only needed to detect the
 * already-a-PDF case.
 */
export async function ensurePdf(params: {
	rawText: string;
	sourceBuffer?: Buffer;
	sourceMimeType?: string | null;
}): Promise<Buffer> {
	if (params.sourceMimeType === 'application/pdf' && params.sourceBuffer) {
		return params.sourceBuffer;
	}

	if (!params.rawText || !params.rawText.trim()) {
		throw new PdfConversionError(
			'No text content to render — nothing was pasted and no text could be extracted from the uploaded file.'
		);
	}

	return renderTextAsPdf(params.rawText);
}

async function renderTextAsPdf(text: string): Promise<Buffer> {
	const pdf = await PDFDocument.create();
	const font = await pdf.embedFont(StandardFonts.Helvetica);

	let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	let cursorY = PAGE_HEIGHT - MARGIN;

	const paragraphs = text.split(/\n{2,}/);

	for (const paragraph of paragraphs) {
		const lines = wrapParagraph(paragraph.replace(/\s+/g, ' ').trim(), font, FONT_SIZE, USABLE_WIDTH);

		for (const line of lines) {
			if (cursorY < MARGIN + LINE_HEIGHT) {
				page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
				cursorY = PAGE_HEIGHT - MARGIN;
			}
			page.drawText(line, {
				x: MARGIN,
				y: cursorY,
				size: FONT_SIZE,
				font,
				color: rgb(0, 0, 0)
			});
			cursorY -= LINE_HEIGHT;
		}

		// Blank line between paragraphs.
		cursorY -= LINE_HEIGHT / 2;
	}

	const bytes = await pdf.save({ useObjectStreams: true });
	return Buffer.from(bytes);
}

/** Simple greedy word-wrap against the font's actual measured width — not a fixed character count, so it holds up across variable-width text. */
function wrapParagraph(paragraph: string, font: PDFFont, size: number, maxWidth: number): string[] {
	if (!paragraph) return [''];

	const words = paragraph.split(' ');
	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
			lines.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}
	if (current) lines.push(current);

	return lines;
}
