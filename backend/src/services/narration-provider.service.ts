/**
 * Provider-agnostic narration (TTS) for cinematic synchronization.
 * NOT the audiobook/Audio Flow product — only for video timing + word timestamps.
 */
import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';

export interface WordTimestampData {
  word: string;
  startMs: number;
  endMs: number;
  index: number;
}

export interface NarrationRequest {
  text: string;
  voice?: string;
  language?: string;
}

export interface NarrationResult {
  providerGenerationId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  audioUrl?: string;
  durationMs?: number;
  wordTimestamps?: WordTimestampData[];
  errorMessage?: string;
}

export interface NarrationProvider {
  readonly name: string;
  generateSpeech(req: NarrationRequest): Promise<NarrationResult>;
  getSpeechStatus(providerGenerationId: string): Promise<NarrationResult>;
  getWordTimestamps?(providerGenerationId: string): Promise<WordTimestampData[]>;
}

/**
 * Unconfigured / stub provider — never fakes completion.
 * Wire a real TTS provider (Google Cloud TTS, ElevenLabs, etc.) via env later.
 */
class UnconfiguredNarrationProvider implements NarrationProvider {
  readonly name = 'UNCONFIGURED';
  async generateSpeech(_req: NarrationRequest): Promise<NarrationResult> {
    return {
      providerGenerationId: '',
      status: 'failed',
      errorMessage:
        'No narration provider configured. Set NARRATION_PROVIDER and its API key to enable TTS + word timestamps.',
    };
  }
  async getSpeechStatus(_id: string): Promise<NarrationResult> {
    return { providerGenerationId: '', status: 'failed', errorMessage: 'No narration provider configured' };
  }
}

/**
 * Estimate word timestamps from duration when real timestamps unavailable.
 * Used only as last-resort fallback — not as primary timing source when real
 * provider timestamps exist.
 */
export function estimateWordTimestamps(text: string, durationMs: number): WordTimestampData[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || durationMs <= 0) return [];
  const totalChars = words.reduce((s, w) => s + w.length, 0) || 1;
  const out: WordTimestampData[] = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const share = words[i].length / totalChars;
    const dur = Math.max(50, Math.round(durationMs * share));
    out.push({ word: words[i], startMs: cursor, endMs: cursor + dur, index: i });
    cursor += dur;
  }
  if (out.length) out[out.length - 1].endMs = durationMs;
  return out;
}

let cached: NarrationProvider | null = null;

export function getNarrationProvider(): NarrationProvider {
  if (!cached) {
    // Future: switch on process.env.NARRATION_PROVIDER
    const configured = Boolean((process.env.NARRATION_API_KEY ?? '').trim());
    if (!configured) {
      logger.warn('Narration provider not configured — word timestamps will use audio-duration fallback when narration exists');
    }
    cached = new UnconfiguredNarrationProvider();
  }
  return cached;
}

export function resetNarrationProviderCache(): void {
  cached = null;
}
