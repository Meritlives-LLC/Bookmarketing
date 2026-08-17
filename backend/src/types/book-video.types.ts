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


export interface AnalyzeProjectJobData { videoProjectId: string; bookId: string; userId: string; }
export interface PlanScenesJobData { videoProjectId: string; bookId: string; chapterId?: string; }
export interface GenerateReferencesJobData { videoProjectId: string; force?: boolean; }
export interface GenerateSceneVideoJobData { videoProjectId: string; sceneId: string; }
export interface GenerateSubtitlesJobData { videoProjectId: string; sceneId?: string; }
export interface AssembleJobData { videoProjectId: string; chapterId?: string; }
export interface CreateVideoProjectInput {
  name?: string; visualStyle?: string; aspectRatio?: string; resolution?: string; videoModel?: string;
  subtitleEnabled?: boolean; subtitleMode?: string; subtitleStyle?: string;
  subtitleConfig?: Record<string, unknown>; narrationWordsPerMinute?: number;
}
export interface VideoProjectProgress {
  projectId: string; status: string; progress: number; totalChapters: number; totalScenes: number;
  completedScenes: number; currentChapter?: number | null; currentScene?: number | null;
  currentShot?: number | null; stageLabel: string; errorMessage?: string | null;
}
export interface VideoGenerationRequest {
  prompt: string; negativePrompt?: string; durationSec?: number; aspectRatio?: string;
  resolution?: string; referenceImageUrls?: string[]; model?: string;
}
export interface VideoGenerationResult {
  providerGenerationId: string; status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string; thumbnailUrl?: string; errorMessage?: string; errorType?: string;
}
export interface SubtitleCueDraft {
  sequence: number; text: string; startTimeMs: number; endTimeMs: number;
  startWordIndex?: number | null; endWordIndex?: number | null; speakerLabel?: string | null;
}
