import { ManuscriptFileType } from '@prisma/client';
import { AppError } from '../utils/helpers';

/**
 * Manuscripts can be large (a full novel export). Keep the default generous
 * but bounded — override via MANUSCRIPT_MAX_FILE_SIZE_MB without a code change.
 */
export const MANUSCRIPT_MAX_FILE_SIZE_BYTES =
  (parseInt(process.env.MANUSCRIPT_MAX_FILE_SIZE_MB ?? '', 10) || 50) * 1024 * 1024;

const MIME_TO_FILE_TYPE: Record<string, ManuscriptFileType> = {
  'application/pdf': ManuscriptFileType.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ManuscriptFileType.DOCX,
  'text/plain': ManuscriptFileType.TXT,
};

const EXTENSION_TO_FILE_TYPE: Record<string, ManuscriptFileType> = {
  pdf: ManuscriptFileType.PDF,
  docx: ManuscriptFileType.DOCX,
  txt: ManuscriptFileType.TXT,
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/**
 * Resolves the declared MIME type + filename extension to a ManuscriptFileType.
 * Both must agree on the same format (or the MIME type must be missing/generic,
 * which some browsers send for .docx) — this is a cheap guard against a
 * mislabeled or spoofed upload, not a substitute for content sniffing.
 * EPUB is intentionally not accepted yet (see spec §3 — architecture allows
 * adding it later without a schema change; ManuscriptFileType would just grow
 * an EPUB member).
 */
export function resolveManuscriptFileType(mimetype: string, originalFileName: string): ManuscriptFileType {
  const ext = extensionOf(originalFileName);
  const byExtension = EXTENSION_TO_FILE_TYPE[ext];
  const byMime = MIME_TO_FILE_TYPE[mimetype.toLowerCase()];

  if (!byExtension) {
    throw AppError.badRequest(
      `Unsupported manuscript file extension "${ext || '(none)'}". Supported: PDF, DOCX, TXT.`,
      'UNSUPPORTED_MANUSCRIPT_FORMAT'
    );
  }

  // Some browsers/OSes send an empty or generic octet-stream mimetype for
  // legitimate files — in that case trust the extension. If the mimetype IS
  // specific and disagrees with the extension, reject as a mismatch.
  const genericMime = !mimetype || mimetype === 'application/octet-stream';
  if (!genericMime && byMime && byMime !== byExtension) {
    throw AppError.badRequest(
      `File extension ".${ext}" does not match its content type ("${mimetype}").`,
      'MANUSCRIPT_TYPE_MISMATCH'
    );
  }

  return byExtension;
}

export function validateManuscriptFileSize(sizeBytes: number): void {
  if (sizeBytes <= 0) {
    throw AppError.badRequest('Uploaded manuscript file is empty.', 'MANUSCRIPT_EMPTY_FILE');
  }
  if (sizeBytes > MANUSCRIPT_MAX_FILE_SIZE_BYTES) {
    const maxMb = Math.round(MANUSCRIPT_MAX_FILE_SIZE_BYTES / (1024 * 1024));
    throw AppError.badRequest(
      `Manuscript file exceeds the ${maxMb}MB limit.`,
      'MANUSCRIPT_TOO_LARGE'
    );
  }
}
