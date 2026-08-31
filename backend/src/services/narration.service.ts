import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import { assertRemoteUrlAllowed, secureDownloadToFile } from '../utils/secure-remote-fetch';
import { storageService } from './storage.service';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface NarrationRequest {
  text: string;
  voiceId: string;
  personaId?: string;
}

export interface NarrationResult {
  audioKey: string;       // storage key, after upload into this app's storage
  durationSec: number;    // Audioflow's estimated duration
  creditsUsed?: number;
}

/**
 * Wraps the Audioflow text-to-speech API (POST /api/v2/text-to-speech).
 *
 * Mirrors the hardening already used for the Veo provider:
 *  - host + protocol pinned via env config, not caller input
 *  - outbound call has a bounded timeout and never follows redirects blindly
 *  - the audio_url Audioflow returns is relative to ITS OWN host, so it is
 *    resolved against the configured base and re-validated (SSRF) before
 *    being downloaded — never trust a returned URL/path outright
 *  - the downloaded file is re-hosted into this app's own storage; nothing
 *    downstream (ffmpeg, public URLs) ever points at the Audioflow host
 */
class AudioflowNarrationProvider {
  private get timeoutMs(): number {
    const value = Number.parseInt(process.env.AUDIOFLOW_TIMEOUT_MS ?? '30000', 10);
    return Number.isFinite(value) ? Math.min(60_000, Math.max(5_000, value)) : 30_000;
  }

  private get apiKey(): string {
    const key = (process.env.AUDIOFLOW_API_KEY ?? '').trim();
    if (!key) {
      throw AppError.badRequest('AUDIOFLOW_API_KEY is not configured.', 'NARRATION_PROVIDER_NOT_CONFIGURED');
    }
    return key;
  }

  /**
   * Base URL is env-configured only — never derived from request input.
   * Enforces HTTPS the same way GeminiVeoProvider.baseUrl does.
   */
  private get baseUrl(): string {
    const configured = process.env.AUDIOFLOW_BASE_URL || '';
    if (!configured) {
      throw AppError.badRequest('AUDIOFLOW_BASE_URL is not configured.', 'NARRATION_PROVIDER_NOT_CONFIGURED');
    }
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      throw AppError.badRequest('Invalid Audioflow base URL', 'NARRATION_PROVIDER_CONFIG_INVALID');
    }
    if (parsed.protocol !== 'https:') {
      throw AppError.badRequest('Audioflow base URL must be HTTPS', 'NARRATION_PROVIDER_CONFIG_INVALID');
    }
    return parsed.toString().replace(/\/$/, '');
  }

  private get allowedHost(): string {
    return new URL(this.baseUrl).hostname;
  }

  async generate(req: NarrationRequest): Promise<NarrationResult> {
    if (!req.text?.trim()) {
      throw AppError.badRequest('Narration text is required', 'NARRATION_TEXT_REQUIRED');
    }
    if (!req.voiceId) {
      throw AppError.badRequest('voiceId is required', 'NARRATION_VOICE_REQUIRED');
    }

    const url = `${this.baseUrl}/api/v2/text-to-speech`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text: req.text,
          voice_id: req.voiceId,
          ...(req.personaId ? { persona_id: req.personaId } : {}),
        }),
        // Never automatically follow a redirect from the narration host.
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw AppError.internal(
        `Audioflow request failed: ${(error as Error).message}`,
        'NARRATION_REQUEST_FAILED',
      );
    }

    if (res.status === 402) {
      throw AppError.badRequest('Audioflow account has insufficient credits', 'NARRATION_INSUFFICIENT_CREDITS');
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw AppError.internal(
        `Audioflow error ${res.status}: ${errText.slice(0, 200)}`,
        'NARRATION_PROVIDER_ERROR',
      );
    }

    const json = (await res.json()) as {
      success?: boolean;
      generation?: {
        id?: string;
        audio_url?: string;
        duration?: number;
        credits_used?: number;
      };
    };

    const audioPath = json.generation?.audio_url;
    if (!json.success || !audioPath) {
      throw AppError.internal('Audioflow response missing audio_url', 'NARRATION_PROVIDER_ERROR');
    }

    // audio_url is relative (e.g. "/audio/tts_<uuid>.mp3"), served off the
    // Audioflow host itself. Resolve against the *configured* base — never
    // let a value from the response introduce a different host — then
    // re-validate before downloading (SSRF hardening, same as Veo clips).
    const resolvedUrl = new URL(audioPath, this.baseUrl).toString();
    const validatedUrl = await assertRemoteUrlAllowed(resolvedUrl, {
      allowedHosts: [this.allowedHost],
    });

    const tmpPath = path.join(os.tmpdir(), `narration-${crypto.randomBytes(8).toString('hex')}.mp3`);
    try {
      await secureDownloadToFile(validatedUrl.toString(), tmpPath, {
        maxBytes: 50 * 1024 * 1024, // narration clips are short; generous cap
        allowedContentTypePrefixes: ['audio/'],
      });

      const buf = await fs.readFile(tmpPath);
      const audioKey = await storageService.uploadBuffer(buf, 'audio/mpeg', 'book-video/narration');

      return {
        audioKey,
        durationSec: json.generation?.duration ?? 0,
        creditsUsed: json.generation?.credits_used,
      };
    } finally {
      try { await fs.rm(tmpPath, { force: true }); } catch { logger.warn('Failed to clean narration temp file', { tmpPath }); }
    }
  }
}

let cached: AudioflowNarrationProvider | null = null;

export function getNarrationProvider(): AudioflowNarrationProvider {
  if (!cached) cached = new AudioflowNarrationProvider();
  return cached;
}

export const narrationService = {
  generate: (req: NarrationRequest) => getNarrationProvider().generate(req),
};
