import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import { VideoGenerationRequest, VideoGenerationResult } from '../types/book-video.types';

export interface VideoProvider {
  readonly name: string;
  generateVideo(req: VideoGenerationRequest): Promise<VideoGenerationResult>;
  getGenerationStatus(providerGenerationId: string): Promise<VideoGenerationResult>;
}

class GeminiVeoProvider implements VideoProvider {
  readonly name = 'GEMINI_VEO';
  private get apiKey(): string {
    const key = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
    if (!key) throw AppError.badRequest('GEMINI_API_KEY is not configured.', 'VIDEO_PROVIDER_NOT_CONFIGURED');
    return key;
  }
  private get model(): string {
    return process.env.VIDEO_MODEL || process.env.GEMINI_VIDEO_MODEL || 'veo-2.0-generate-001';
  }
  private get baseUrl(): string {
    return process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  }
  /**
   * `videoModel` on a video project is user-supplied (CreateVideoProjectInput,
   * set at project-creation time with no server-side validation upstream) and
   * ends up interpolated directly into the outbound Gemini API URL path. Left
   * unchecked, a user could point this server's outbound request at an
   * arbitrary path/model — this is the single point every generateVideo()
   * call passes through, so the allowlist is enforced here rather than
   * relying on validation at every caller.
   */
  private static readonly ALLOWED_MODELS = new Set([
    'veo-2.0-generate-001',
    'veo-3.0-generate-001',
    'veo-3.0-fast-generate-001',
  ]);
  private resolveAllowedModel(requested: string | undefined): string {
    const candidate = requested || this.model;
    if (!/^[a-zA-Z0-9._-]+$/.test(candidate) || !GeminiVeoProvider.ALLOWED_MODELS.has(candidate)) {
      logger.warn('Rejected disallowed/malformed video model', { requested: candidate });
      throw AppError.badRequest(`Unsupported video model: ${candidate}`, 'INVALID_VIDEO_MODEL');
    }
    return candidate;
  }
  async generateVideo(req: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const model = this.resolveAllowedModel(req.model);
    const url = `${this.baseUrl}/models/${model}:predictLongRunning`;
    // Pass reference images when the model supports them (Veo image-to-video / reference).
    // Do not fake support — only include fields the current API accepts.
    const instance: Record<string, unknown> = { prompt: req.prompt };
    if (req.referenceImageUrls?.length) {
      // Gemini/Veo currently accepts reference images as image objects with uri/bytes.
      // We pass public HTTPS URLs; if the model rejects, the error surfaces to the worker.
      instance.image = { uri: req.referenceImageUrls[0] };
      if (req.referenceImageUrls.length > 1) {
        instance.referenceImages = req.referenceImageUrls.slice(0, 3).map((uri) => ({ uri }));
      }
    }
    const body = {
      instances: [instance],
      parameters: {
        aspectRatio: req.aspectRatio || '16:9',
        ...(req.durationSec ? { durationSeconds: Math.min(8, Math.max(2, Math.round(req.durationSec))) } : {}),
        ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}),
      },
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        // The API key travels as a header, not a query-string parameter —
        // query strings are far more likely to be captured in access logs,
        // proxy logs, referrer headers, and error-reporting tools.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const errorType = res.status === 429 ? 'RATE_LIMIT' : res.status === 400 ? 'INVALID_PROMPT' : 'UNKNOWN';
        return { providerGenerationId: '', status: 'failed', errorMessage: `Provider ${res.status}: ${errText.slice(0, 200)}`, errorType };
      }
      const json = (await res.json()) as { name?: string };
      if (!json.name) return { providerGenerationId: '', status: 'failed', errorMessage: 'No operation id', errorType: 'UNKNOWN' };
      return { providerGenerationId: json.name, status: 'queued' };
    } catch (error) {
      return { providerGenerationId: '', status: 'failed', errorMessage: (error as Error).message, errorType: 'TIMEOUT' };
    }
  }
  async getGenerationStatus(providerGenerationId: string): Promise<VideoGenerationResult> {
    // providerGenerationId is stored from an earlier provider response and
    // later interpolated straight into this URL's path — validate its shape
    // first so a corrupted/tampered value (e.g. containing "://" or "../")
    // can't redirect this request to an unexpected host or path.
    if (!/^[a-zA-Z0-9_\-./]+$/.test(providerGenerationId) || providerGenerationId.includes('..')) {
      return { providerGenerationId, status: 'failed', errorMessage: 'Invalid operation id', errorType: 'UNKNOWN' };
    }
    const url = `${this.baseUrl}/${providerGenerationId}`;
    try {
      const res = await fetch(url, { headers: { 'x-goog-api-key': this.apiKey } });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { providerGenerationId, status: 'failed', errorMessage: errText.slice(0, 200), errorType: 'UNKNOWN' };
      }
      const json = (await res.json()) as {
        done?: boolean; error?: { message?: string };
        response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
      };
      if (json.error) return { providerGenerationId, status: 'failed', errorMessage: json.error.message || 'error', errorType: 'UNKNOWN' };
      if (!json.done) return { providerGenerationId, status: 'processing' };
      const videoUri = json.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!videoUri) return { providerGenerationId, status: 'failed', errorMessage: 'No video URI', errorType: 'UNKNOWN' };
      return { providerGenerationId, status: 'completed', videoUrl: videoUri };
    } catch (error) {
      return { providerGenerationId, status: 'failed', errorMessage: (error as Error).message, errorType: 'TIMEOUT' };
    }
  }
}

class UnconfiguredProvider implements VideoProvider {
  readonly name = 'UNCONFIGURED';
  async generateVideo(): Promise<VideoGenerationResult> {
    return { providerGenerationId: '', status: 'failed', errorMessage: 'Set VIDEO_PROVIDER=GEMINI_VEO and GEMINI_API_KEY.', errorType: 'UNKNOWN' };
  }
  async getGenerationStatus(): Promise<VideoGenerationResult> {
    return { providerGenerationId: '', status: 'failed', errorMessage: 'No video provider configured', errorType: 'UNKNOWN' };
  }
}

let cached: VideoProvider | null = null;
export function getVideoProvider(): VideoProvider {
  if (!cached) {
    const hasKey = Boolean((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim());
    cached = hasKey ? new GeminiVeoProvider() : new UnconfiguredProvider();
    if (!hasKey) logger.warn('Video provider credentials missing');
  }
  return cached;
}
export function resetVideoProviderCache(): void { cached = null; }
