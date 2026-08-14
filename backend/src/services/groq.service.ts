/**
 * Thin client for Groq's free, OpenAI-compatible chat completions API
 * (https://console.groq.com/docs/api-reference). Nothing else in the app
 * should import `axios`/build these requests directly — go through
 * `groqService.chat()` / `groqService.chatJSON()` so retry, timeout, and
 * error handling stay in one place.
 *
 * Groq's free tier needs only an API key (no card). If `GROQ_API_KEY` is
 * unset, `config.ai.groq.enabled` is false and `groqAiService` (see
 * `groq-ai.service.ts`) never calls this — callers fall back to
 * `localAiService` instead.
 */
import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export class GroqError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'GroqError';
  }
}

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Ask Groq to constrain output to valid JSON (json_object mode). */
  jsonMode?: boolean;
}

const client = axios.create({
  baseURL: config.ai.groq.baseUrl,
  timeout: config.ai.groq.timeoutMs,
  headers: { 'Content-Type': 'application/json' },
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Groq (like most inference providers) rate-limits aggressively on the free
// tier. 429s and 5xxs are worth a short backoff-and-retry; 4xx auth/validation
// errors are not.
function isRetryable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 429 || status === undefined || (status >= 500 && status < 600);
}

async function post(messages: GroqMessage[], options: ChatOptions): Promise<string> {
  if (!config.ai.groq.enabled) {
    throw new GroqError('Groq is not configured (GROQ_API_KEY is unset)');
  }

  const body: Record<string, unknown> = {
    model: config.ai.groq.model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_completion_tokens: options.maxTokens ?? 1024,
  };
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= config.ai.groq.maxRetries; attempt++) {
    try {
      const { data } = await client.post('/chat/completions', body, {
        headers: { Authorization: `Bearer ${config.ai.groq.apiKey}` },
      });
      const content: string | undefined = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new GroqError('Groq returned an empty completion');
      }
      return content;
    } catch (error) {
      lastError = error;
      if (attempt < config.ai.groq.maxRetries && isRetryable(error)) {
        const retryAfterHeader = axios.isAxiosError(error)
          ? Number((error as AxiosError).response?.headers?.['retry-after'])
          : NaN;
        const waitMs = Number.isFinite(retryAfterHeader)
          ? retryAfterHeader * 1000
          : 400 * 2 ** attempt;
        logger.warn('Groq request failed, retrying', {
          attempt: attempt + 1,
          waitMs,
          error: axios.isAxiosError(error) ? error.response?.data ?? error.message : error,
        });
        await sleep(waitMs);
        continue;
      }
      break;
    }
  }

  const message = axios.isAxiosError(lastError)
    ? `Groq request failed: ${lastError.response?.status ?? ''} ${JSON.stringify(lastError.response?.data ?? lastError.message)}`
    : `Groq request failed: ${(lastError as Error)?.message ?? lastError}`;
  throw new GroqError(message, lastError);
}

export const groqService = {
  /** Free-form chat completion; returns the assistant's raw text. */
  async chat(messages: GroqMessage[], options: ChatOptions = {}): Promise<string> {
    return post(messages, options);
  },

  /**
   * Chat completion constrained to JSON, parsed and returned as `T`.
   * The system/user prompt must itself instruct the model to return JSON
   * matching the expected shape — `jsonMode` only enforces well-formed JSON,
   * not a particular schema.
   */
  async chatJSON<T>(messages: GroqMessage[], options: ChatOptions = {}): Promise<T> {
    const raw = await post(messages, { ...options, jsonMode: true });
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      throw new GroqError(`Groq returned invalid JSON: ${raw.slice(0, 200)}`, error);
    }
  },
};
