/**
 * Extracts plain text from a manuscript file.
 *
 * CRITICAL: this must never reword, summarize, or otherwise alter the
 * author's text — only whitespace/line-ending normalization is applied.
 * Everything downstream (chapter segmentation, sourceText, narrationText)
 * depends on this being the literal manuscript content (spec §14/§34).
 */
import { ManuscriptFileType } from '@prisma/client';
import { ExtractedManuscriptText } from '../types/book-video.types';
import { AppError } from './helpers';

/** Normalizes line endings only — CRLF/CR → LF. No wording is touched. */
function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

async function extractTxt(buffer: Buffer): Promise<ExtractedManuscriptText> {
  const warnings: string[] = [];
  let decoded = buffer.toString('utf-8');

  // Heuristic: a high ratio of the UTF-8 replacement character usually means
  // the file wasn't actually UTF-8 (common for older Windows exports). We
  // still return the UTF-8 decode (best effort) but flag it so the UI can
  // warn the author to re-export as UTF-8 rather than silently mangling text.
  const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
  if (decoded.length > 0 && replacementCount / decoded.length > 0.01) {
    warnings.push(
      'File does not appear to be valid UTF-8 text — some characters may have been lost. Re-export as UTF-8 for best results.'
    );
  }

  decoded = normalizeLineEndings(decoded);
  return {
    text: decoded,
    wordCount: countWords(decoded),
    characterCount: decoded.length,
    warnings,
  };
}

async function extractDocx(buffer: Buffer): Promise<ExtractedManuscriptText> {
  // Lazy import: keeps this dependency out of the hot path for TXT/PDF uploads.
  const mammoth = await import('mammoth');
  let result;
  try {
    result = await mammoth.extractRawText({ buffer });
  } catch (error) {
    throw AppError.badRequest(
      `Could not read DOCX file: ${(error as Error).message}`,
      'MANUSCRIPT_EXTRACTION_FAILED'
    );
  }

  const warnings = (result.messages || [])
    .filter((m) => m.type === 'warning' || m.type === 'error')
    .map((m) => m.message)
    .slice(0, 20); // don't let a pathological file flood the record with warnings

  const text = normalizeLineEndings(result.value || '');
  if (!text.trim()) {
    throw AppError.badRequest(
      'DOCX file contained no extractable text.',
      'MANUSCRIPT_EMPTY_EXTRACTION'
    );
  }

  return {
    text,
    wordCount: countWords(text),
    characterCount: text.length,
    warnings,
  };
}

async function extractPdf(buffer: Buffer): Promise<ExtractedManuscriptText> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    // pdf-parse joins pages with form-feed-ish breaks in places; normalize to
    // a paragraph break so chapter segmentation sees clean text.
    const text = normalizeLineEndings(result.text || '').replace(/\f/g, '\n\n');

    if (!text.trim()) {
      throw AppError.badRequest(
        'PDF contained no extractable text. Scanned/image-only PDFs are not supported yet (would require OCR).',
        'MANUSCRIPT_EMPTY_EXTRACTION'
      );
    }

    return {
      text,
      wordCount: countWords(text),
      characterCount: text.length,
      warnings: [],
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest(
      `Could not read PDF file: ${(error as Error).message}`,
      'MANUSCRIPT_EXTRACTION_FAILED'
    );
  } finally {
    await parser.destroy();
  }
}

export async function extractManuscriptText(
  buffer: Buffer,
  fileType: ManuscriptFileType
): Promise<ExtractedManuscriptText> {
  switch (fileType) {
    case ManuscriptFileType.TXT:
      return extractTxt(buffer);
    case ManuscriptFileType.DOCX:
      return extractDocx(buffer);
    case ManuscriptFileType.PDF:
      return extractPdf(buffer);
    default:
      throw AppError.badRequest(`Unsupported manuscript file type: ${fileType}`);
  }
}
