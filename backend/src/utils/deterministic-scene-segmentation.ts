/**
 * Deterministic scene segmentation fallback.
 *
 * Hierarchy (always 100% source coverage, no gaps/overlaps):
 *   chapter
 *     → paragraphs
 *       → narrative blocks
 *         → scenes
 *           → provider-safe shots
 *
 * Used when AI scene planning fails or returns invalid coverage.
 * Never discards source text.
 */

import { splitDurationIntoShots } from './text-chunking';

export interface SourceRange {
  sourceStart: number;
  sourceEnd: number;
  sourceText: string;
}

export interface DeterministicShot {
  shotNumber: number;
  shotType: string;
  sourceTextSegment: string;
  durationSec: number;
  startOffsetSec: number;
  camera: string;
  lens: string;
  movement: string;
  composition: string;
  lighting: string;
}

export interface DeterministicScene {
  sceneNumber: number;
  sourceStart: number;
  sourceEnd: number;
  sourceText: string;
  estimatedDurationSec: number;
  shots: DeterministicShot[];
}

export interface SegmentOptions {
  /** Target words per scene (default 350). */
  targetWordsPerScene?: number;
  /** Max words in a single paragraph before forced split (default 500). */
  maxWordsPerParagraphBlock?: number;
  /** Narration words-per-minute for duration estimates (default 150). */
  wpm?: number;
  /** Provider max shot duration seconds (default 8). */
  maxShotSec?: number;
  /** Provider min shot duration seconds (default 2). */
  minShotSec?: number;
}

interface Paragraph {
  start: number;
  end: number;
  text: string;
  words: number;
}

interface NarrativeBlock {
  start: number;
  end: number;
  text: string;
  words: number;
  paragraphs: Paragraph[];
}

const DEFAULTS: Required<SegmentOptions> = {
  targetWordsPerScene: 350,
  maxWordsPerParagraphBlock: 500,
  wpm: 150,
  maxShotSec: 8,
  minShotSec: 2,
};

/** Split text into paragraphs, keeping delimiter characters in the preceding span. */
function extractParagraphs(text: string): Paragraph[] {
  if (!text.length) return [];
  const paragraphs: Paragraph[] = [];
  const re = /\n\s*\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    const slice = text.slice(last, end);
    // Keep even whitespace-only middle regions so offsets stay contiguous
    paragraphs.push({
      start: last,
      end,
      text: slice,
      words: slice.split(/\s+/).filter(Boolean).length,
    });
    last = end;
  }
  if (last < text.length) {
    const slice = text.slice(last);
    paragraphs.push({
      start: last,
      end: text.length,
      text: slice,
      words: slice.split(/\s+/).filter(Boolean).length,
    });
  }
  if (!paragraphs.length && text.length) {
    paragraphs.push({
      start: 0,
      end: text.length,
      text,
      words: text.split(/\s+/).filter(Boolean).length,
    });
  }
  return paragraphs;
}

/**
 * Split an oversize paragraph into sentence-level blocks (still contiguous).
 */
function splitLongParagraph(p: Paragraph, maxWords: number): Paragraph[] {
  if (p.words <= maxWords) return [p];
  const parts: Paragraph[] = [];
  const sentenceRe = /(?<=[.!?…])\s+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const local = p.text;
  const sentences: Array<{ start: number; end: number; text: string; words: number }> = [];
  while ((m = sentenceRe.exec(local)) !== null) {
    const end = m.index + m[0].length;
    const slice = local.slice(last, end);
    sentences.push({
      start: p.start + last,
      end: p.start + end,
      text: slice,
      words: slice.split(/\s+/).filter(Boolean).length,
    });
    last = end;
  }
  if (last < local.length) {
    const slice = local.slice(last);
    sentences.push({
      start: p.start + last,
      end: p.end,
      text: slice,
      words: slice.split(/\s+/).filter(Boolean).length,
    });
  }
  if (!sentences.length) return [p];

  let bufStart = sentences[0].start;
  let bufEnd = sentences[0].end;
  let bufWords = 0;
  let bufText = '';
  const flush = () => {
    if (!bufText.length) return;
    parts.push({ start: bufStart, end: bufEnd, text: bufText, words: bufWords });
    bufText = '';
    bufWords = 0;
  };
  for (const s of sentences) {
    if (bufWords > 0 && bufWords + s.words > maxWords) {
      flush();
      bufStart = s.start;
    }
    if (!bufText.length) bufStart = s.start;
    bufText += s.text;
    bufEnd = s.end;
    bufWords += s.words;
  }
  flush();
  return parts.length ? parts : [p];
}

/**
 * Group paragraphs into narrative blocks near targetWordsPerScene.
 * Ensures contiguous coverage of the whole chapter.
 */
function buildNarrativeBlocks(
  paragraphs: Paragraph[],
  targetWords: number,
  maxParaWords: number
): NarrativeBlock[] {
  const expanded: Paragraph[] = [];
  for (const p of paragraphs) {
    expanded.push(...splitLongParagraph(p, maxParaWords));
  }
  if (!expanded.length) return [];

  const blocks: NarrativeBlock[] = [];
  let acc: Paragraph[] = [];
  let accWords = 0;

  const flush = () => {
    if (!acc.length) return;
    blocks.push({
      start: acc[0].start,
      end: acc[acc.length - 1].end,
      text: acc.map((x) => x.text).join(''),
      words: accWords,
      paragraphs: acc,
    });
    acc = [];
    accWords = 0;
  };

  for (const p of expanded) {
    // Start a new block when we'd exceed target (and we already have content)
    if (accWords > 0 && accWords + p.words > targetWords) {
      flush();
    }
    acc.push(p);
    accWords += p.words;
  }
  flush();

  // Enforce absolute contiguous coverage against the original expanded spans
  if (blocks.length) {
    // First block must start at first paragraph start; last must end at last end
    // (already true if expanded covers full text)
  }
  return blocks;
}

const SHOT_TYPES = ['establishing', 'wide', 'medium', 'close-up', 'insert'] as const;
const CAMERAS = ['static', 'slow push-in', 'gentle pan', 'tracking', 'over-shoulder'] as const;
const LENSES = ['24mm', '35mm', '50mm', '85mm'] as const;
const LIGHTING = ['natural soft key', 'motivated practical', 'high-key daylight', 'low-key dramatic'] as const;

function buildShotsForScene(
  sourceText: string,
  durationSec: number,
  maxShotSec: number,
  minShotSec: number
): DeterministicShot[] {
  const durs = splitDurationIntoShots(durationSec, maxShotSec, minShotSec);
  const words = sourceText.split(/\s+/).filter(Boolean);
  const totalWords = words.length || 1;
  let wordCursor = 0;
  let timeOff = 0;
  const shots: DeterministicShot[] = [];

  for (let i = 0; i < durs.length; i++) {
    const d = durs[i];
    const share = d / Math.max(durationSec, 0.01);
    const wordCount = Math.max(1, Math.round(totalWords * share));
    const endWord = Math.min(words.length, wordCursor + wordCount);
    const segment =
      i === durs.length - 1
        ? words.slice(wordCursor).join(' ')
        : words.slice(wordCursor, endWord).join(' ');
    wordCursor = endWord;

    const type = SHOT_TYPES[Math.min(i, SHOT_TYPES.length - 1)];
    shots.push({
      shotNumber: i + 1,
      shotType: type,
      sourceTextSegment: segment || sourceText.slice(0, 200),
      durationSec: d,
      startOffsetSec: timeOff,
      camera: CAMERAS[i % CAMERAS.length],
      lens: LENSES[i % LENSES.length],
      movement: i === 0 ? 'static hold then slow push' : CAMERAS[i % CAMERAS.length],
      composition: type === 'close-up' ? 'tight framed subject' : 'rule-of-thirds',
      lighting: LIGHTING[i % LIGHTING.length],
    });
    timeOff += d;
  }
  return shots;
}

/**
 * Primary entry: segment a full chapter into deterministic scenes + shots.
 * Guarantees:
 *   scene[0].sourceStart === 0
 *   scene[i].sourceEnd === scene[i+1].sourceStart
 *   scene[last].sourceEnd === text.length
 *   joined sourceText === original text
 */
export function segmentChapterDeterministic(
  text: string,
  options: SegmentOptions = {}
): DeterministicScene[] {
  const opts = { ...DEFAULTS, ...options };
  if (!text.length) return [];

  const paragraphs = extractParagraphs(text);
  const blocks = buildNarrativeBlocks(
    paragraphs,
    opts.targetWordsPerScene,
    opts.maxWordsPerParagraphBlock
  );

  if (!blocks.length) {
    const est = Math.max(
      opts.minShotSec,
      Math.round((text.split(/\s+/).filter(Boolean).length / opts.wpm) * 60)
    );
    return [
      {
        sceneNumber: 1,
        sourceStart: 0,
        sourceEnd: text.length,
        sourceText: text,
        estimatedDurationSec: est,
        shots: buildShotsForScene(text, est, opts.maxShotSec, opts.minShotSec),
      },
    ];
  }

  const scenes: DeterministicScene[] = blocks.map((b, i) => {
    const est = Math.max(
      opts.minShotSec,
      Math.round((b.words / opts.wpm) * 60)
    );
    return {
      sceneNumber: i + 1,
      sourceStart: b.start,
      sourceEnd: b.end,
      sourceText: text.slice(b.start, b.end),
      estimatedDurationSec: est,
      shots: buildShotsForScene(text.slice(b.start, b.end), est, opts.maxShotSec, opts.minShotSec),
    };
  });

  // Force exact full coverage (repair any delimiter edge cases)
  return enforceFullCoverage(text, scenes, opts);
}

/**
 * Repair an existing scene proposal list to 100% coverage.
 * - Clamps ranges into [0, text.length]
 * - Sorts by sourceStart
 * - Closes gaps by extending previous end / next start
 * - Removes pure overlaps by adjusting boundaries
 * - If unrecoverable, replaces with segmentChapterDeterministic
 */
export function repairCoverageOrFallback(
  text: string,
  proposals: Array<{ sourceStart: number; sourceEnd: number }>,
  options: SegmentOptions = {}
): DeterministicScene[] {
  if (!text.length) return [];
  if (!proposals.length) return segmentChapterDeterministic(text, options);

  const sorted = proposals
    .map((p) => ({
      sourceStart: Math.max(0, Math.min(p.sourceStart, text.length)),
      sourceEnd: Math.max(0, Math.min(p.sourceEnd, text.length)),
    }))
    .filter((p) => p.sourceEnd > p.sourceStart)
    .sort((a, b) => a.sourceStart - b.sourceStart);

  if (!sorted.length) return segmentChapterDeterministic(text, options);

  // Close gaps / overlaps
  sorted[0].sourceStart = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].sourceStart < sorted[i - 1].sourceEnd) {
      // overlap → start at previous end
      sorted[i].sourceStart = sorted[i - 1].sourceEnd;
    } else if (sorted[i].sourceStart > sorted[i - 1].sourceEnd) {
      // gap → extend previous end to this start
      sorted[i - 1].sourceEnd = sorted[i].sourceStart;
    }
  }
  sorted[sorted.length - 1].sourceEnd = text.length;

  // Drop empty after repair
  const cleaned = sorted.filter((p) => p.sourceEnd > p.sourceStart);
  if (!cleaned.length) return segmentChapterDeterministic(text, options);

  const opts = { ...DEFAULTS, ...options };
  return cleaned.map((p, i) => {
    const sourceText = text.slice(p.sourceStart, p.sourceEnd);
    const words = sourceText.split(/\s+/).filter(Boolean).length;
    const est = Math.max(opts.minShotSec, Math.round((words / opts.wpm) * 60));
    return {
      sceneNumber: i + 1,
      sourceStart: p.sourceStart,
      sourceEnd: p.sourceEnd,
      sourceText,
      estimatedDurationSec: est,
      shots: buildShotsForScene(sourceText, est, opts.maxShotSec, opts.minShotSec),
    };
  });
}

function enforceFullCoverage(
  text: string,
  scenes: DeterministicScene[],
  opts: Required<SegmentOptions>
): DeterministicScene[] {
  if (!scenes.length) {
    return segmentChapterDeterministic(text, opts);
  }
  const fixed = scenes.map((s) => ({ ...s }));
  fixed[0].sourceStart = 0;
  fixed[0].sourceText = text.slice(0, fixed[0].sourceEnd);
  for (let i = 1; i < fixed.length; i++) {
    fixed[i].sourceStart = fixed[i - 1].sourceEnd;
    fixed[i].sourceText = text.slice(fixed[i].sourceStart, fixed[i].sourceEnd);
  }
  fixed[fixed.length - 1].sourceEnd = text.length;
  fixed[fixed.length - 1].sourceText = text.slice(
    fixed[fixed.length - 1].sourceStart,
    text.length
  );

  // Drop empties created by repair
  const nonEmpty = fixed.filter((s) => s.sourceEnd > s.sourceStart);
  return nonEmpty.map((s, i) => {
    const words = s.sourceText.split(/\s+/).filter(Boolean).length;
    const est = Math.max(opts.minShotSec, Math.round((words / opts.wpm) * 60));
    return {
      ...s,
      sceneNumber: i + 1,
      estimatedDurationSec: est,
      shots: buildShotsForScene(s.sourceText, est, opts.maxShotSec, opts.minShotSec),
    };
  });
}

/** Validate 100% contiguous coverage. */
export function assertFullCoverage(
  text: string,
  scenes: Array<{ sourceStart: number; sourceEnd: number }>
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!scenes.length) return { ok: false, errors: ['No scenes'] };
  const sorted = [...scenes].sort((a, b) => a.sourceStart - b.sourceStart);
  if (sorted[0].sourceStart !== 0) errors.push(`First scene starts at ${sorted[0].sourceStart}, expected 0`);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].sourceEnd <= sorted[i].sourceStart) {
      errors.push(`Scene ${i + 1}: end <= start`);
    }
    if (i > 0 && sorted[i].sourceStart !== sorted[i - 1].sourceEnd) {
      errors.push(
        `Gap/overlap between scene ${i} end=${sorted[i - 1].sourceEnd} and scene ${i + 1} start=${sorted[i].sourceStart}`
      );
    }
  }
  if (sorted[sorted.length - 1].sourceEnd !== text.length) {
    errors.push(
      `Last scene ends at ${sorted[sorted.length - 1].sourceEnd}, expected ${text.length}`
    );
  }
  return { ok: errors.length === 0, errors };
}
