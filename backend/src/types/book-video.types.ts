/**
 * Raw uploaded file as multer hands it to us (memoryStorage → buffer in RAM,
 * never touches disk). Kept narrow so services don't depend on Express types.
 */
export interface UploadedManuscriptFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** Result of extracting plain text from a manuscript file, before segmentation. */
export interface ExtractedManuscriptText {
  /** Normalized text (line-ending normalization only — never reworded). */
  text: string;
  wordCount: number;
  characterCount: number;
  /** Non-fatal issues surfaced by the extractor (e.g. unsupported DOCX elements). */
  warnings: string[];
}

export type ChapterDetectionMethod = 'heading' | 'fallback-chunk';

export type ChapterKind =
  | 'prologue'
  | 'epilogue'
  | 'part'
  | 'interlude'
  | 'chapter'
  | 'untitled';

export interface ChapterExtractionMetadata {
  detectionMethod: ChapterDetectionMethod;
  kind?: ChapterKind;
  matchedPattern?: string;
  headingRaw?: string;
  /** Chapter number as parsed from the heading text itself (may be non-sequential/absent). */
  parsedNumber?: number | null;
}

/** One detected chapter, prior to being persisted as a Chapter row. */
export interface ChapterSegment {
  chapterNumber: number;
  title: string | null;
  sourceText: string;
  wordCount: number;
  startPosition: number;
  endPosition: number;
  extractionMetadata: ChapterExtractionMetadata;
}

export interface ManuscriptJobData {
  manuscriptId: string;
  bookId: string;
}
