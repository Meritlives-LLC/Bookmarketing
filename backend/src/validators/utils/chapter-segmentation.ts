/**
 * Detects chapter boundaries in extracted manuscript text.
 *
 * Two modes:
 *  1. Heading detection — looks for "Chapter N", "CHAPTER ONE", "Prologue",
 *     bare numbered/roman-numeral lines, etc. Filters out table-of-contents
 *     clusters (a common false-positive source: a ToC lists every heading
 *     within a few hundred words of each other, near the start of the file).
 *  2. Fallback chunking — for continuous prose with no detectable headings,
 *     splits on paragraph boundaries into chapter-sized chunks. Never splits
 *     mid-paragraph, never rewords anything.
 *
 * sourceText for every resulting segment is an exact substring of the input —
 * this file must never rewrite or normalize wording (spec §14/§34).
 */
import { ChapterExtractionMetadata, ChapterKind, ChapterSegment } from '../types/book-video.types';

const FALLBACK_TARGET_WORDS = 2500;
const FALLBACK_MAX_WORDS = 4000;
const FALLBACK_MIN_WORDS = 800;

/** Consecutive headings closer together than this (in words) are treated as a ToC listing, not real chapter starts. */
const TOC_CLUSTER_GAP_WORDS = 25;

/** Minimum number of accepted headings before we trust heading-based segmentation over fallback chunking. */
const MIN_HEADINGS_TO_TRUST = 2;

const WORD_NUMBERS: string[] = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three',
  'twenty-four', 'twenty-five', 'twenty-six', 'twenty-seven', 'twenty-eight',
  'twenty-nine', 'thirty', 'thirty-one', 'thirty-two', 'thirty-three', 'thirty-four',
  'thirty-five', 'thirty-six', 'thirty-seven', 'thirty-eight', 'thirty-nine', 'forty',
];
const WORD_NUMBER_LOOKUP = new Map<string, number>(
  WORD_NUMBERS.reduce<Array<[string, number]>>((pairs, word, index) => {
    if (word !== '') pairs.push([word, index]);
    return pairs;
  }, [])
);

function wordToNumber(word: string): number | null {
  return WORD_NUMBER_LOOKUP.get(word.toLowerCase()) ?? null;
}

const ROMAN_PATTERN = /^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function romanToNumber(roman: string): number | null {
  const upper = roman.toUpperCase();
  if (!upper || !ROMAN_PATTERN.test(upper) || upper.length > 7) return null;
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const current = ROMAN_VALUES[upper[i].toLowerCase()];
    const next = i + 1 < upper.length ? ROMAN_VALUES[upper[i + 1].toLowerCase()] : 0;
    total += current < next ? -current : current;
  }
  return total > 0 ? total : null;
}

/** Parses a heading's number token as digits, a roman numeral, or a spelled-out word. */
function parseHeadingNumber(token: string): number | null {
  const trimmed = token.trim();
  if (/^\d{1,4}$/.test(trimmed)) return parseInt(trimmed, 10);
  const roman = romanToNumber(trimmed);
  if (roman !== null) return roman;
  return wordToNumber(trimmed);
}

interface HeadingCandidate {
  lineIndex: number;
  charOffset: number;
  headingRaw: string;
  matchedPattern: string;
  kind: ChapterKind;
  parsedNumber: number | null;
  title: string | null;
}

const NAMED_SECTION_PATTERN =
  /^(prologue|epilogue|foreword|afterword|introduction|preface|interlude|intermission|coda)\b[:.\-–—]?\s*(.*)$/i;
const CHAPTER_PATTERN = /^(?:chapter|ch\.)\s+([a-z0-9\-]+)\b[:.\-–—]?\s*(.*)$/i;
const PART_PATTERN = /^part\s+([a-z0-9\-]+)\b[:.\-–—]?\s*(.*)$/i;
const BARE_NUMBER_PATTERN = /^(\d{1,4})[.\)]?$/;
const BARE_ROMAN_PATTERN = /^([IVXLCDM]{1,7})$/; // uppercase only — lowercase roman-looking words are too ambiguous

function cleanTitle(raw: string): string | null {
  const trimmed = raw.trim().replace(/^[:.\-–—\s]+/, '').trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}

function matchHeading(line: string): HeadingCandidate | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return null;

  let m: RegExpMatchArray | null;

  if ((m = trimmed.match(NAMED_SECTION_PATTERN))) {
    const label = m[1].toLowerCase();
    const kind: ChapterKind =
      label === 'prologue' ? 'prologue' : label === 'epilogue' ? 'epilogue' : 'interlude';
    return {
      lineIndex: -1,
      charOffset: -1,
      headingRaw: trimmed,
      matchedPattern: 'named-section',
      kind,
      parsedNumber: null,
      title: cleanTitle(m[2]) ?? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(),
    };
  }

  if ((m = trimmed.match(CHAPTER_PATTERN))) {
    return {
      lineIndex: -1,
      charOffset: -1,
      headingRaw: trimmed,
      matchedPattern: 'chapter-word',
      kind: 'chapter',
      parsedNumber: parseHeadingNumber(m[1]),
      title: cleanTitle(m[2]),
    };
  }

  if ((m = trimmed.match(PART_PATTERN))) {
    return {
      lineIndex: -1,
      charOffset: -1,
      headingRaw: trimmed,
      matchedPattern: 'part-word',
      kind: 'part',
      parsedNumber: parseHeadingNumber(m[1]),
      title: cleanTitle(m[2]),
    };
  }

  if ((m = trimmed.match(BARE_NUMBER_PATTERN))) {
    return {
      lineIndex: -1,
      charOffset: -1,
      headingRaw: trimmed,
      matchedPattern: 'bare-number',
      kind: 'untitled',
      parsedNumber: parseInt(m[1], 10),
      title: null,
    };
  }

  if ((m = trimmed.match(BARE_ROMAN_PATTERN))) {
    const num = romanToNumber(m[1]);
    if (num !== null) {
      return {
        lineIndex: -1,
        charOffset: -1,
        headingRaw: trimmed,
        matchedPattern: 'bare-roman',
        kind: 'untitled',
        parsedNumber: num,
        title: null,
      };
    }
  }

  return null;
}

function findHeadingCandidates(text: string): HeadingCandidate[] {
  const candidates: HeadingCandidate[] = [];
  let offset = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = matchHeading(line);
    if (match) {
      candidates.push({ ...match, lineIndex: i, charOffset: offset });
    }
    offset += line.length + 1; // +1 for the '\n' removed by split
  }
  return candidates;
}

/**
 * Drops headings that form a tight cluster (few words apart) — almost
 * always a table of contents rather than real chapter starts. Keeps the
 * LAST heading of a cluster, since a ToC is typically followed immediately
 * by the real content starting at the final listed entry, or by front
 * matter before the true first chapter (which a later, isolated match will
 * catch on its own).
 */
function dropTocClusters(candidates: HeadingCandidate[], fullText: string): HeadingCandidate[] {
  if (candidates.length < 3) return candidates;

  const wordsBetween = (fromOffset: number, toOffset: number): number => {
    const slice = fullText.slice(fromOffset, toOffset);
    const matches = slice.match(/\S+/g);
    return matches ? matches.length : 0;
  };

  const keep: boolean[] = candidates.map(() => true);
  for (let i = 0; i < candidates.length - 1; i++) {
    const gap = wordsBetween(candidates[i].charOffset, candidates[i + 1].charOffset);
    if (gap < TOC_CLUSTER_GAP_WORDS) {
      keep[i] = false; // drop the earlier one; a cluster collapses toward its last member
    }
  }
  return candidates.filter((_, i) => keep[i]);
}

function buildMetadata(candidate: HeadingCandidate): ChapterExtractionMetadata {
  return {
    detectionMethod: 'heading',
    kind: candidate.kind,
    matchedPattern: candidate.matchedPattern,
    headingRaw: candidate.headingRaw,
    parsedNumber: candidate.parsedNumber,
  };
}

function segmentByHeadings(text: string, candidates: HeadingCandidate[]): ChapterSegment[] {
  const sorted = [...candidates].sort((a, b) => a.charOffset - b.charOffset);
  const segments: ChapterSegment[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].charOffset;
    const end = i + 1 < sorted.length ? sorted[i + 1].charOffset : text.length;
    const sourceText = text.slice(start, end);
    const wordCount = (sourceText.match(/\S+/g) || []).length;

    segments.push({
      chapterNumber: i + 1,
      title: sorted[i].title,
      sourceText,
      wordCount,
      startPosition: start,
      endPosition: end,
      extractionMetadata: buildMetadata(sorted[i]),
    });
  }

  return segments;
}

interface ParagraphSpan {
  text: string;
  start: number;
  end: number;
  wordCount: number;
}

function splitIntoParagraphs(text: string): ParagraphSpan[] {
  const spans: ParagraphSpan[] = [];
  const blankLineBreak = /\n{2,}/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  const pushSpan = (start: number, end: number) => {
    const raw = text.slice(start, end);
    if (raw.trim().length === 0) return;
    spans.push({ text: raw, start, end, wordCount: (raw.match(/\S+/g) || []).length });
  };

  while ((match = blankLineBreak.exec(text)) !== null) {
    pushSpan(lastEnd, match.index);
    lastEnd = blankLineBreak.lastIndex;
  }
  pushSpan(lastEnd, text.length);

  return spans;
}

/**
 * No reliable headings — split into chapter-sized chunks at paragraph
 * boundaries only. Never breaks mid-paragraph/mid-sentence.
 */
function segmentByFallbackChunking(text: string): ChapterSegment[] {
  const paragraphs = splitIntoParagraphs(text);
  if (paragraphs.length === 0) return [];

  const segments: ChapterSegment[] = [];
  let chunkStart = paragraphs[0].start;
  let chunkWordCount = 0;
  let chunkEnd = paragraphs[0].start;

  const flush = (end: number) => {
    if (chunkWordCount === 0) return;
    const sourceText = text.slice(chunkStart, end);
    segments.push({
      chapterNumber: segments.length + 1,
      title: null,
      sourceText,
      wordCount: (sourceText.match(/\S+/g) || []).length,
      startPosition: chunkStart,
      endPosition: end,
      extractionMetadata: { detectionMethod: 'fallback-chunk' },
    });
  };

  for (const para of paragraphs) {
    const wouldExceedMax = chunkWordCount + para.wordCount > FALLBACK_MAX_WORDS;
    const alreadyAtTarget = chunkWordCount >= FALLBACK_TARGET_WORDS;
    const belowMin = chunkWordCount < FALLBACK_MIN_WORDS;

    if ((wouldExceedMax || alreadyAtTarget) && !belowMin && chunkWordCount > 0) {
      flush(chunkEnd);
      chunkStart = para.start;
      chunkWordCount = 0;
    }

    chunkWordCount += para.wordCount;
    chunkEnd = para.end;
  }
  flush(chunkEnd);

  return segments;
}

export function segmentChapters(text: string): ChapterSegment[] {
  if (!text.trim()) return [];

  const rawCandidates = findHeadingCandidates(text);
  const accepted = dropTocClusters(rawCandidates, text);

  if (accepted.length >= MIN_HEADINGS_TO_TRUST) {
    return segmentByHeadings(text, accepted);
  }

  return segmentByFallbackChunking(text);
}

// Exported for unit testing.
export const __testables = {
  romanToNumber,
  wordToNumber,
  matchHeading,
  dropTocClusters,
  findHeadingCandidates,
};
