import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import { SubtitleCueDraft } from '../types/book-video.types';

const DEFAULT_MAX_CHARS = 42, DEFAULT_MAX_LINES = 2, DEFAULT_MIN_MS = 800, DEFAULT_MAX_MS = 6000;

function splitIntoCues(text: string, totalDurationMs: number, opts: { maxChars: number; maxLines: number; minMs: number; maxMs: number }): SubtitleCueDraft[] {
  const sentences = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  const segments: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= opts.maxChars * opts.maxLines) { segments.push(sentence); continue; }
    const phrases = sentence.split(/(?<=[,;:—–])\s+/);
    let buf = '';
    for (const phrase of phrases) {
      const candidate = buf ? `${buf} ${phrase}` : phrase;
      if (candidate.length <= opts.maxChars * opts.maxLines) buf = candidate;
      else {
        if (buf) segments.push(buf);
        if (phrase.length > opts.maxChars * opts.maxLines) {
          const words = phrase.split(/\s+/); let line = '';
          for (const w of words) {
            const next = line ? `${line} ${w}` : w;
            if (next.length <= opts.maxChars * opts.maxLines) line = next;
            else { if (line) segments.push(line); line = w; }
          }
          buf = line;
        } else buf = phrase;
      }
    }
    if (buf) segments.push(buf);
  }
  if (!segments.length) return [{ sequence: 1, text: text.slice(0, opts.maxChars * opts.maxLines), startTimeMs: 0, endTimeMs: Math.max(opts.minMs, totalDurationMs) }];
  const totalChars = segments.reduce((s, t) => s + t.length, 0) || 1;
  const cues: SubtitleCueDraft[] = []; let cursor = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    let dur = Math.round(totalDurationMs * (seg.length / totalChars));
    dur = Math.max(opts.minMs, Math.min(opts.maxMs, dur));
    if (i === segments.length - 1) dur = Math.max(opts.minMs, totalDurationMs - cursor);
    cues.push({ sequence: i + 1, text: seg, startTimeMs: cursor, endTimeMs: cursor + dur });
    cursor += dur;
  }
  return cues;
}

function formatSrt(cues: Array<{ sequence: number; text: string; startTimeMs: number; endTimeMs: number }>): string {
  const ts = (ms: number) => {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), milli = ms % 1000;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(milli).padStart(3,'0')}`;
  };
  return cues.map((c) => `${c.sequence}\n${ts(c.startTimeMs)} --> ${ts(c.endTimeMs)}\n${c.text}\n`).join('\n');
}

function formatVtt(cues: Array<{ sequence: number; text: string; startTimeMs: number; endTimeMs: number }>): string {
  const ts = (ms: number) => {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), milli = ms % 1000;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(milli).padStart(3,'0')}`;
  };
  return 'WEBVTT\n\n' + cues.map((c) => `${c.sequence}\n${ts(c.startTimeMs)} --> ${ts(c.endTimeMs)}\n${c.text}\n`).join('\n');
}

function validateCues(cues: Array<{ startTimeMs: number; endTimeMs: number; text: string }>, videoDurationMs?: number): string[] {
  const errors: string[] = [];
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (!c.text?.trim()) errors.push(`Cue ${i+1}: empty text`);
    if (c.startTimeMs < 0) errors.push(`Cue ${i+1}: negative start`);
    if (c.endTimeMs <= c.startTimeMs) errors.push(`Cue ${i+1}: end <= start`);
    if (i > 0 && cues[i-1].endTimeMs - c.startTimeMs > 50) errors.push(`Cue ${i+1}: overlaps previous`);
    if (videoDurationMs != null && c.endTimeMs > videoDurationMs + 500) errors.push(`Cue ${i+1}: exceeds video duration`);
  }
  return errors;
}

export const subtitleService = {
  async generateForScene(sceneId: string) {
    const scene = await prisma.videoScene.findUnique({ where: { id: sceneId } });
    if (!scene) throw AppError.notFound('Scene not found');
    const text = scene.narrationText || scene.sourceText;
    // Timing priority: 1) word timestamps  2) actual narration/audio duration  3) estimated
    const wordTs = await prisma.wordTimestamp.findMany({
      where: { sceneId },
      orderBy: { index: 'asc' },
    });
    const project = await prisma.videoProject.findUnique({ where: { id: scene.videoProjectId } });
    const cfg = (project?.subtitleConfig as Record<string, number>) || {};
    let cues: SubtitleCueDraft[];
    if (wordTs.length > 0) {
      // Build cues from real word timestamps — pack into readable segments without changing words
      const maxChars = cfg.maxCharsPerLine ?? DEFAULT_MAX_CHARS;
      const maxLines = cfg.maxLines ?? DEFAULT_MAX_LINES;
      const limit = maxChars * maxLines;
      cues = [];
      let buf: typeof wordTs = [];
      let seq = 1;
      const flush = () => {
        if (!buf.length) return;
        cues.push({
          sequence: seq++,
          text: buf.map((w) => w.word).join(' '),
          startTimeMs: buf[0].startMs,
          endTimeMs: buf[buf.length - 1].endMs,
          startWordIndex: buf[0].index,
          endWordIndex: buf[buf.length - 1].index,
        });
        buf = [];
      };
      for (const w of wordTs) {
        const candidate = [...buf, w].map((x) => x.word).join(' ');
        if (buf.length && candidate.length > limit) flush();
        buf.push(w);
      }
      flush();
    } else {
      const durationSec =
        scene.narrationDurationSec ??
        scene.actualDurationSec ??
        scene.estimatedDurationSec ??
        Math.max(4, text.split(/\s+/).length / 2.5);
      // Only use estimated when actual durations are absent
      const totalMs = Math.round(durationSec * 1000);
      cues = splitIntoCues(text, totalMs, {
        maxChars: cfg.maxCharsPerLine ?? DEFAULT_MAX_CHARS,
        maxLines: cfg.maxLines ?? DEFAULT_MAX_LINES,
        minMs: cfg.minDurationMs ?? DEFAULT_MIN_MS,
        maxMs: cfg.maxDurationMs ?? DEFAULT_MAX_MS,
      });
    }
    const errors = validateCues(cues, totalMs);
    if (errors.length) logger.warn('Subtitle validation issues', { sceneId, errors });
    await prisma.subtitleCue.deleteMany({ where: { sceneId } });
    await prisma.subtitleCue.createMany({
      data: cues.map((c) => ({
        sceneId, sequence: c.sequence, text: c.text, startTimeMs: c.startTimeMs, endTimeMs: c.endTimeMs,
        startWordIndex: c.startWordIndex ?? null, endWordIndex: c.endWordIndex ?? null, speakerLabel: c.speakerLabel ?? null,
      })),
    });
    return { srt: formatSrt(cues), vtt: formatVtt(cues), cueCount: cues.length };
  },
  async assembleChapterSubtitles(sceneIds: string[], sceneOffsetsMs: number[]) {
    const allCues: Array<{ sequence: number; text: string; startTimeMs: number; endTimeMs: number }> = [];
    let seq = 1;
    for (let i = 0; i < sceneIds.length; i++) {
      const cues = await prisma.subtitleCue.findMany({ where: { sceneId: sceneIds[i] }, orderBy: { sequence: 'asc' } });
      const offset = sceneOffsetsMs[i] ?? 0;
      for (const c of cues) allCues.push({ sequence: seq++, text: c.text, startTimeMs: c.startTimeMs + offset, endTimeMs: c.endTimeMs + offset });
    }
    return { srt: formatSrt(allCues), vtt: formatVtt(allCues) };
  },
  formatSrt, formatVtt, validateCues,
};
