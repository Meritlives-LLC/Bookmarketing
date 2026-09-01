import WebSocket from 'ws';
import { createHash, randomBytes } from 'crypto';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import { storageService } from './storage.service';

export interface NarrationRequest {
  text: string;
  voiceId: string;
  rate?: string;   // e.g. '-10%', 'default'
  pitch?: string;  // e.g. '+5%', 'default'
  volume?: string; // e.g. 'default'
}

export interface NarrationResult {
  audioKey: string;    // storage key after upload into this app's own storage
  durationSec: number; // estimated from output file size
}

// ---------------------------------------------------------------------------
// This talks directly to Microsoft Edge's built-in "Read Aloud" text-to-speech
// service over its consumer WebSocket endpoint — the same free engine behind
// Edge's narration feature. No account, credits, or API key are involved;
// the "trusted client token" below is a fixed, publicly known value used by
// Edge itself to identify requests as coming from the browser, not a secret
// issued per-user. There is nothing to "sign up" for.
//
// Because this bypasses Microsoft's supported API surface, it can break if
// Microsoft changes the endpoint/token scheme — there's no SLA here. Treat
// it as a free/best-effort narration path, not a production guarantee.
// ---------------------------------------------------------------------------

const EDGE_CHROMIUM_FULL_VERSION = '143.0.3650.75';
const EDGE_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WINDOWS_FILE_TIME_EPOCH = 11644473600n;

const MAX_TEXT_LENGTH = 20_000; // guards against pathologically large single calls
const DEFAULT_TIMEOUT_MS = 20_000;

export const NARRATION_VOICES = [
  { id: 'en-US-AriaNeural', name: 'Aria', gender: 'Female', language: 'en-US' },
  { id: 'en-US-GuyNeural', name: 'Guy', gender: 'Male', language: 'en-US' },
  { id: 'en-US-AnaNeural', name: 'Ana', gender: 'Female', language: 'en-US' },
  { id: 'en-US-EricNeural', name: 'Eric', gender: 'Male', language: 'en-US' },
  { id: 'en-US-MichelleNeural', name: 'Michelle', gender: 'Female', language: 'en-US' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia', gender: 'Female', language: 'en-GB' },
  { id: 'en-GB-RyanNeural', name: 'Ryan', gender: 'Male', language: 'en-GB' },
  { id: 'es-ES-AlvaroNeural', name: 'Alvaro', gender: 'Male', language: 'es-ES' },
  { id: 'ja-JP-NanamiNeural', name: 'Nanami', gender: 'Female', language: 'ja-JP' },
  { id: 'fr-FR-HenriNeural', name: 'Henri', gender: 'Male', language: 'fr-FR' },
  { id: 'de-DE-ConradNeural', name: 'Conrad', gender: 'Male', language: 'de-DE' },
  { id: 'hi-IN-SwaraNeural', name: 'Swara', gender: 'Female', language: 'hi-IN' },
  { id: 'ko-KR-SunHiNeural', name: 'SunHi', gender: 'Female', language: 'ko-KR' },
] as const;

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return char;
    }
  });
}

function generateEdgeSecMsGecToken(): string {
  const ticks = BigInt(Math.floor(Date.now() / 1000) + Number(WINDOWS_FILE_TIME_EPOCH)) * 10_000_000n;
  const roundedTicks = ticks - (ticks % 3_000_000_000n);
  const hash = createHash('sha256');
  hash.update(`${roundedTicks}${EDGE_TRUSTED_CLIENT_TOKEN}`, 'ascii');
  return hash.digest('hex').toUpperCase();
}

function buildEdgeSsml(
  text: string,
  { voice, lang, rate = 'default', pitch = 'default', volume = 'default' }:
  { voice: string; lang: string; rate?: string; pitch?: string; volume?: string },
): string {
  const escaped = escapeXml(text);
  const body = rate === 'default' && pitch === 'default' && volume === 'default'
    ? `<voice name="${voice}">${escaped}</voice>`
    : `<voice name="${voice}"><prosody rate="${rate}" pitch="${pitch}" volume="${volume}">${escaped}</prosody></voice>`;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}">${body}</speak>`;
}

function synthesizeEdgeTtsSsml(
  ssml: string,
  audioPath: string,
  { outputFormat = 'audio-24khz-48kbitrate-mono-mp3', timeoutMs = DEFAULT_TIMEOUT_MS }: { outputFormat?: string; timeoutMs?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${generateEdgeSecMsGecToken()}&Sec-MS-GEC-Version=1-${EDGE_CHROMIUM_FULL_VERSION}`,
      {
        headers: {
          Pragma: 'no-cache',
          'Cache-Control': 'no-cache',
          'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${EDGE_CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0 Safari/537.36 Edg/${EDGE_CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0`,
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
    );

    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const timer = setTimeout(() => fail(new Error('Edge TTS request timed out')), timeoutMs);

    ws.once('error', fail);

    ws.once('open', () => {
      ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"${outputFormat}"}}}}`);

      const audioStream = createWriteStream(audioPath);
      const requestId = randomBytes(16).toString('hex');

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (settled) return;
        if (isBinary) {
          const separator = 'Path:audio\r\n';
          const index = data.indexOf(separator) + separator.length;
          audioStream.write(data.subarray(index));
          return;
        }
        const message = data.toString();
        if (message.includes('Path:turn.end')) {
          audioStream.end();
          audioStream.on('finish', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch { /* ignore */ }
            resolve();
          });
        }
      });

      audioStream.on('error', fail);

      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
    });
  });
}

function resolveVoice(voiceId: string): { id: string; language: string } {
  const match = NARRATION_VOICES.find((v) => v.id === voiceId);
  if (match) return { id: match.id, language: match.language };
  logger.warn('Unknown narration voiceId — falling back to default', { voiceId });
  return { id: 'en-US-AriaNeural', language: 'en-US' };
}

export const narrationService = {
  voices: NARRATION_VOICES,

  async generate(req: NarrationRequest): Promise<NarrationResult> {
    const text = (req.text || '').trim();
    if (!text) {
      throw AppError.badRequest('Narration text is required', 'NARRATION_TEXT_REQUIRED');
    }
    if (text.length > MAX_TEXT_LENGTH) {
      throw AppError.badRequest(`Narration text exceeds ${MAX_TEXT_LENGTH} characters`, 'NARRATION_TEXT_TOO_LONG');
    }

    const voice = resolveVoice(req.voiceId);
    const ssml = buildEdgeSsml(text, {
      voice: voice.id,
      lang: voice.language,
      rate: req.rate,
      pitch: req.pitch,
      volume: req.volume,
    });

    const tmpPath = path.join(os.tmpdir(), `narration-${randomBytes(8).toString('hex')}.mp3`);
    try {
      await synthesizeEdgeTtsSsml(ssml, tmpPath);

      const stats = await fs.stat(tmpPath);
      if (stats.size < 500) {
        throw AppError.internal('Edge TTS returned an empty audio file', 'NARRATION_EMPTY_RESULT');
      }

      const buf = await fs.readFile(tmpPath);
      const audioKey = await storageService.uploadBuffer(buf, 'audio/mpeg', 'book-video/narration');

      return {
        audioKey,
        // Rough estimate (bytes / bitrate proxy) — good enough for
        // scene-duration reconciliation, not exact.
        durationSec: Math.max(1, Math.round(stats.size / 6000)),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw AppError.internal(`Narration generation failed: ${(error as Error).message}`, 'NARRATION_FAILED');
    } finally {
      try { await fs.rm(tmpPath, { force: true }); } catch { /* best-effort cleanup */ }
    }
  },
};
