import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import {
  VideoGenerationRequest,
  VideoGenerationResult,
} from '../types/book-video.types';
import {
  assertRemoteUrlAllowed,
  GOOGLE_PROVIDER_HOSTS,
} from '../utils/secure-remote-fetch';

export interface VideoProvider {
  readonly name: string;
  generateVideo(
    req: VideoGenerationRequest,
  ): Promise<VideoGenerationResult>;
  getGenerationStatus(
    providerGenerationId: string,
  ): Promise<VideoGenerationResult>;
}

class GeminiVeoProvider implements VideoProvider {
  readonly name = 'GEMINI_VEO';

  private get timeoutMs(): number {
    const value = Number.parseInt(process.env.VIDEO_PROVIDER_TIMEOUT_MS ?? '45000', 10);
    return Number.isFinite(value) ? Math.min(120_000, Math.max(5_000, value)) : 45_000;
  }

  private get apiKey(): string {
    const key = (
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_API_KEY ??
      ''
    ).trim();

    if (!key) {
      throw AppError.badRequest(
        'GEMINI_API_KEY is not configured.',
        'VIDEO_PROVIDER_NOT_CONFIGURED',
      );
    }

    return key;
  }

  private get model(): string {
    return (
      process.env.VIDEO_MODEL ||
      process.env.GEMINI_VIDEO_MODEL ||
      'veo-2.0-generate-001'
    );
  }

  private get baseUrl(): string {
    const configured =
      process.env.GEMINI_API_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta';

    let parsed: URL;

    try {
      parsed = new URL(configured);
    } catch {
      throw AppError.badRequest(
        'Invalid Gemini API base URL',
        'VIDEO_PROVIDER_CONFIG_INVALID',
      );
    }

    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'generativelanguage.googleapis.com'
    ) {
      throw AppError.badRequest(
        'Gemini API base URL is not allowed',
        'VIDEO_PROVIDER_CONFIG_INVALID',
      );
    }

    return parsed.toString().replace(/\/$/, '');
  }

  /**
   * `videoModel` on a video project is user-supplied
   * and ends up interpolated into the outbound Gemini API URL.
   *
   * Keep the provider restricted to explicitly supported models.
   */
  private static readonly ALLOWED_MODELS = new Set([
    'veo-2.0-generate-001',
    'veo-3.0-generate-001',
    'veo-3.0-fast-generate-001',
  ]);

  private resolveAllowedModel(
    requested: string | undefined,
  ): string {
    const candidate = requested || this.model;

    if (
      !/^[a-zA-Z0-9._-]+$/.test(candidate) ||
      !GeminiVeoProvider.ALLOWED_MODELS.has(candidate)
    ) {
      logger.warn(
        'Rejected disallowed/malformed video model',
        { requested: candidate },
      );

      throw AppError.badRequest(
        `Unsupported video model: ${candidate}`,
        'INVALID_VIDEO_MODEL',
      );
    }

    return candidate;
  }

  /**
   * Reference images are handed to Google's infrastructure.
   * Validate them before allowing them into the provider request.
   */
  private async validateReferenceImage(
    uri: string,
  ): Promise<string> {
    try {
      const validated = await assertRemoteUrlAllowed(uri);

      if (
        !(GOOGLE_PROVIDER_HOSTS as readonly string[]).includes(
          validated.hostname,
        )
      ) {
        /*
         * Gemini can consume externally hosted reference
         * images, so do not restrict this to Google hosts.
         *
         * assertRemoteUrlAllowed() already enforces:
         * - HTTPS
         * - DNS resolution
         * - private/reserved IP rejection
         * - localhost rejection
         */
      }

      return validated.toString();
    } catch {
      throw AppError.badRequest(
        'Reference image URL is not allowed',
        'INVALID_REFERENCE_IMAGE_URL',
      );
    }
  }

  async generateVideo(
    req: VideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const model = this.resolveAllowedModel(req.model);

    const url =
      `${this.baseUrl}/models/${model}:predictLongRunning`;

    // Pass reference images when the model supports them.
    // Do not fake support — only include fields the current API accepts.
    const instance: Record<string, unknown> = {
      prompt: req.prompt,
    };

    if (req.referenceImageUrls?.length) {
      const referenceUrls =
        await Promise.all(
          req.referenceImageUrls
            .slice(0, 3)
            .map((uri) =>
              this.validateReferenceImage(uri),
            ),
        );

      instance.image = {
        uri: referenceUrls[0],
      };

      if (referenceUrls.length > 1) {
        instance.referenceImages =
          referenceUrls.map((uri) => ({
            uri,
          }));
      }
    }

    const body = {
      instances: [instance],
      parameters: {
        aspectRatio:
          req.aspectRatio || '16:9',

        ...(req.durationSec
          ? {
              durationSeconds: Math.min(
                8,
                Math.max(
                  2,
                  Math.round(req.durationSec),
                ),
              ),
            }
          : {}),

        ...(req.negativePrompt
          ? {
              negativePrompt:
                req.negativePrompt,
            }
          : {}),
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',

        // API key is sent in a header rather than
        // the URL query string.
        headers: {
          'Content-Type':
            'application/json',
          'x-goog-api-key': this.apiKey,
        },

        body: JSON.stringify(body),

        // Never automatically follow a provider redirect.
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        const errText = await res
          .text()
          .catch(() => '');

        const errorType =
          res.status === 429
            ? 'RATE_LIMIT'
            : res.status === 400
              ? 'INVALID_PROMPT'
              : 'UNKNOWN';

        return {
          providerGenerationId: '',
          status: 'failed',
          errorMessage:
            `Provider ${res.status}: ${errText.slice(0, 200)}`,
          errorType,
        };
      }

      const json = (await res.json()) as {
        name?: string;
      };

      if (!json.name) {
        return {
          providerGenerationId: '',
          status: 'failed',
          errorMessage: 'No operation id',
          errorType: 'UNKNOWN',
        };
      }

      /*
       * The operation ID becomes part of a later URL path.
       * Reject URL/path injection characters.
       */
      if (
        !/^[a-zA-Z0-9_.:/-]+$/.test(
          json.name,
        ) ||
        json.name.includes('..') ||
        json.name.includes('://')
      ) {
        logger.warn(
          'Gemini returned invalid operation identifier',
          {
            providerGenerationId: json.name,
          },
        );

        return {
          providerGenerationId: '',
          status: 'failed',
          errorMessage:
            'Invalid provider operation id',
          errorType: 'UNKNOWN',
        };
      }

      return {
        providerGenerationId: json.name,
        status: 'queued',
      };
    } catch (error) {
      return {
        providerGenerationId: '',
        status: 'failed',
        errorMessage:
          (error as Error).message,
        errorType: 'TIMEOUT',
      };
    }
  }

  async getGenerationStatus(
    providerGenerationId: string,
  ): Promise<VideoGenerationResult> {
    /*
     * providerGenerationId is stored from an earlier
     * provider response and later becomes part of a URL.
     */
    if (
      !/^[a-zA-Z0-9_.:/-]+$/.test(
        providerGenerationId,
      ) ||
      providerGenerationId.includes('..') ||
      providerGenerationId.includes('://')
    ) {
      return {
        providerGenerationId,
        status: 'failed',
        errorMessage: 'Invalid operation id',
        errorType: 'UNKNOWN',
      };
    }

    const url =
      `${this.baseUrl}/${providerGenerationId}`;

    try {
      const res = await fetch(url, {
        headers: {
          'x-goog-api-key': this.apiKey,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        const errText = await res
          .text()
          .catch(() => '');

        return {
          providerGenerationId,
          status: 'failed',
          errorMessage:
            errText.slice(0, 200),
          errorType: 'UNKNOWN',
        };
      }

      const json = (await res.json()) as {
        done?: boolean;
        error?: {
          message?: string;
        };
        response?: {
          generateVideoResponse?: {
            generatedSamples?: Array<{
              video?: {
                uri?: string;
              };
            }>;
          };
        };
      };

      if (json.error) {
        return {
          providerGenerationId,
          status: 'failed',
          errorMessage:
            json.error.message || 'error',
          errorType: 'UNKNOWN',
        };
      }

      if (!json.done) {
        return {
          providerGenerationId,
          status: 'processing',
        };
      }

      const videoUri =
        json.response
          ?.generateVideoResponse
          ?.generatedSamples?.[0]
          ?.video?.uri;

      if (!videoUri) {
        return {
          providerGenerationId,
          status: 'failed',
          errorMessage: 'No video URI',
          errorType: 'UNKNOWN',
        };
      }

      /*
       * Provider-returned media URLs must be validated
       * before they enter the rest of the application.
       *
       * Only known Google media hosts are accepted here.
       */
      const validatedVideoUrl =
        await assertRemoteUrlAllowed(
          videoUri,
          {
            allowedHosts:
              GOOGLE_PROVIDER_HOSTS,
          },
        );

      return {
        providerGenerationId,
        status: 'completed',
        videoUrl:
          validatedVideoUrl.toString(),
      };
    } catch (error) {
      return {
        providerGenerationId,
        status: 'failed',
        errorMessage:
          (error as Error).message,
        errorType: 'TIMEOUT',
      };
    }
  }
}

class UnconfiguredProvider
  implements VideoProvider {
  readonly name = 'UNCONFIGURED';

  async generateVideo(): Promise<VideoGenerationResult> {
    return {
      providerGenerationId: '',
      status: 'failed',
      errorMessage:
        'Set VIDEO_PROVIDER=GEMINI_VEO and GEMINI_API_KEY.',
      errorType: 'UNKNOWN',
    };
  }

  async getGenerationStatus(): Promise<VideoGenerationResult> {
    return {
      providerGenerationId: '',
      status: 'failed',
      errorMessage:
        'No video provider configured',
      errorType: 'UNKNOWN',
    };
  }
}

let cached: VideoProvider | null = null;

export function getVideoProvider(): VideoProvider {
  if (!cached) {
    const hasKey = Boolean(
      (
        process.env.GEMINI_API_KEY ??
        process.env.GOOGLE_API_KEY ??
        ''
      ).trim(),
    );

    cached = hasKey
      ? new GeminiVeoProvider()
      : new UnconfiguredProvider();

    if (!hasKey) {
      logger.warn(
        'Video provider credentials missing',
      );
    }
  }

  return cached;
}

export function resetVideoProviderCache(): void {
  cached = null;
}
