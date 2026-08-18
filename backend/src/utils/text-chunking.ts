/**
 * Hierarchical text chunking for complete-manuscript AI processing.
 * Never discards source text — every character is assigned to exactly one chunk.
 */
export interface TextChunk {
  index: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Split text into ordered chunks of at most maxChars, preferring paragraph
 * boundaries, then sentence boundaries, then hard splits.
 * Guarantees: chunks cover [0, text.length) with no gaps or overlaps.
 */
export function chunkTextHierarchical(text: string, maxChars = 8000): TextChunk[] {
  if (!text.length) return [];
  if (text.length <= maxChars) {
    return [{ index: 0, start: 0, end: text.length, text }];
  }

  const paragraphs = splitKeepingDelimiters(text, /\n\s*\n/);
  const chunks: TextChunk[] = [];
  let buf = '';
  let bufStart = 0;
  let cursor = 0;

  const flush = () => {
    if (!buf.length) return;
    chunks.push({
      index: chunks.length,
      start: bufStart,
      end: bufStart + buf.length,
      text: buf,
    });
    buf = '';
  };

  for (const part of paragraphs) {
    if (buf.length + part.length <= maxChars) {
      if (!buf.length) bufStart = cursor;
      buf += part;
    } else {
      if (buf.length) flush();
      if (part.length <= maxChars) {
        bufStart = cursor;
        buf = part;
      } else {
        // Split long paragraph by sentences
        const sentences = splitKeepingDelimiters(part, /(?<=[.!?…])\s+/);
        let sBuf = '';
        let sStart = cursor;
        let sCursor = cursor;
        for (const sent of sentences) {
          if (sBuf.length + sent.length <= maxChars) {
            if (!sBuf.length) sStart = sCursor;
            sBuf += sent;
          } else {
            if (sBuf.length) {
              chunks.push({ index: chunks.length, start: sStart, end: sStart + sBuf.length, text: sBuf });
              sBuf = '';
            }
            if (sent.length <= maxChars) {
              sStart = sCursor;
              sBuf = sent;
            } else {
              // Hard split
              let offset = 0;
              while (offset < sent.length) {
                const slice = sent.slice(offset, offset + maxChars);
                chunks.push({
                  index: chunks.length,
                  start: sCursor + offset,
                  end: sCursor + offset + slice.length,
                  text: slice,
                });
                offset += slice.length;
              }
              sBuf = '';
            }
          }
          sCursor += sent.length;
        }
        if (sBuf.length) {
          chunks.push({ index: chunks.length, start: sStart, end: sStart + sBuf.length, text: sBuf });
        }
        buf = '';
      }
    }
    cursor += part.length;
  }
  if (buf.length) flush();

  // Validate full coverage
  if (chunks.length === 0) {
    return [{ index: 0, start: 0, end: text.length, text }];
  }
  if (chunks[0].start !== 0 || chunks[chunks.length - 1].end !== text.length) {
    // Safety: single full chunk
    return [{ index: 0, start: 0, end: text.length, text }];
  }
  for (let i = 1; i < chunks.length; i++) {
    if (chunks[i].start !== chunks[i - 1].end) {
      return [{ index: 0, start: 0, end: text.length, text }];
    }
  }
  return chunks;
}

function splitKeepingDelimiters(text: string, re: RegExp): string[] {
  const parts: string[] = [];
  let last = 0;
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    const end = m.index + m[0].length;
    parts.push(text.slice(last, end));
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.filter((p) => p.length > 0);
}

/**
 * Deterministic scene segmentation from paragraphs when AI fails.
 * Groups paragraphs into scenes of roughly targetWords each, keeping
 * 100% coverage with contiguous sourceStart/sourceEnd.
 */
export function segmentByParagraphs(
  text: string,
  targetWordsPerScene = 350
): Array<{ sceneNumber: number; sourceStart: number; sourceEnd: number; sourceText: string }> {
  if (!text.length) return [];
  const paraRe = /\n\s*\n/;
  const parts: Array<{ start: number; end: number; text: string; words: number }> = [];
  let last = 0;
  const global = new RegExp(paraRe.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    const end = m.index + m[0].length;
    const slice = text.slice(last, end);
    if (slice.trim().length) {
      parts.push({ start: last, end, text: slice, words: slice.split(/\s+/).filter(Boolean).length });
    }
    last = end;
  }
  if (last < text.length) {
    const slice = text.slice(last);
    parts.push({ start: last, end: text.length, text: slice, words: slice.split(/\s+/).filter(Boolean).length });
  }
  if (!parts.length) {
    return [{ sceneNumber: 1, sourceStart: 0, sourceEnd: text.length, sourceText: text }];
  }

  const scenes: Array<{ sceneNumber: number; sourceStart: number; sourceEnd: number; sourceText: string }> = [];
  let accStart = parts[0].start;
  let accEnd = parts[0].end;
  let accWords = 0;
  let accText = '';

  const flushScene = () => {
    if (!accText.length) return;
    scenes.push({
      sceneNumber: scenes.length + 1,
      sourceStart: accStart,
      sourceEnd: accEnd,
      sourceText: text.slice(accStart, accEnd),
    });
    accText = '';
    accWords = 0;
  };

  for (const p of parts) {
    if (accWords > 0 && accWords + p.words > targetWordsPerScene) {
      flushScene();
      accStart = p.start;
    }
    if (!accText.length) accStart = p.start;
    accText += p.text;
    accEnd = p.end;
    accWords += p.words;
  }
  flushScene();

  // Ensure full coverage
  if (!scenes.length) {
    return [{ sceneNumber: 1, sourceStart: 0, sourceEnd: text.length, sourceText: text }];
  }
  scenes[0].sourceStart = 0;
  scenes[0].sourceText = text.slice(0, scenes[0].sourceEnd);
  scenes[scenes.length - 1].sourceEnd = text.length;
  scenes[scenes.length - 1].sourceText = text.slice(scenes[scenes.length - 1].sourceStart, text.length);
  // Fix gaps between scenes
  for (let i = 1; i < scenes.length; i++) {
    scenes[i].sourceStart = scenes[i - 1].sourceEnd;
    scenes[i].sourceText = text.slice(scenes[i].sourceStart, scenes[i].sourceEnd);
  }
  return scenes;
}

/**
 * Split a target scene duration into provider-safe shot durations.
 * maxShotSec is the provider max (e.g. 8 for Veo).
 */
export function splitDurationIntoShots(
  totalSec: number,
  maxShotSec = 8,
  minShotSec = 2
): number[] {
  const total = Math.max(minShotSec, totalSec);
  if (total <= maxShotSec) return [total];
  const n = Math.ceil(total / maxShotSec);
  const base = total / n;
  const durations: number[] = [];
  let remaining = total;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      durations.push(Math.max(minShotSec, remaining));
    } else {
      const d = Math.min(maxShotSec, Math.max(minShotSec, Math.round(base * 10) / 10));
      durations.push(d);
      remaining -= d;
    }
  }
  return durations;
}
