/**
 * Stable AI entry point.
 *
 * - GROQ_API_KEY set → try Groq (with timeout)
 * - timeout, rate limit, or any error → localAiService (templates / offline)
 * - After several consecutive Groq failures, skip Groq for the rest of the
 *   process lifetime so audits finish quickly on free-tier TPM limits.
 */
import { Book } from '@prisma/client';
import { config } from '../config';
import { localAiService } from './local-ai.service';
import { groqAiService } from './groq-ai.service';
import { logger } from '../utils/logger';

/** Hard ceiling for one Groq attempt (includes its internal retries). */
const GROQ_CALL_TIMEOUT_MS = Math.max(
  5_000,
  parseInt(process.env.GROQ_FALLBACK_TIMEOUT_MS ?? '', 10) ||
    config.ai.groq.timeoutMs ||
    20_000
);

/** After this many consecutive failures, stop calling Groq until process restart. */
const MAX_CONSECUTIVE_FAILURES = 3;

let consecutiveFailures = 0;
let groqCircuitOpen = false;

function openCircuit(reason: string): void {
  if (!groqCircuitOpen) {
    groqCircuitOpen = true;
    logger.warn('Groq circuit open — using local-ai for remaining calls', { reason });
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Groq timed out after ${ms}ms (${label})`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withFallback<T>(
  label: string,
  groqCall: () => Promise<T>,
  localCall: () => Promise<T>
): Promise<T> {
  if (!config.ai.groq.enabled || groqCircuitOpen) {
    return localCall();
  }

  try {
    const result = await withTimeout(groqCall(), GROQ_CALL_TIMEOUT_MS, label);
    consecutiveFailures = 0;
    return result;
  } catch (error) {
    consecutiveFailures += 1;
    const message = (error as Error).message || String(error);

    logger.warn(`Groq call failed for ${label}, falling back to local-ai`, {
      error: message,
      consecutiveFailures,
    });

    if (
      consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ||
      /rate_limit|429|timed out/i.test(message)
    ) {
      openCircuit(message);
    }

    return localCall();
  }
}

export const aiService = {
  async generateAudienceInsight(
    book: Book,
    segment: string,
    platform: string,
    scrapedContext?: string
  ) {
    return withFallback(
      'generateAudienceInsight',
      () => groqAiService.generateAudienceInsight(book, segment, platform, scrapedContext),
      () => localAiService.generateAudienceInsight(book, segment, platform)
    );
  },

  async generateKeywordSuggestions(book: Book, scrapedContext?: string) {
    return withFallback(
      'generateKeywordSuggestions',
      () => groqAiService.generateKeywordSuggestions(book, scrapedContext),
      () => localAiService.generateKeywordSuggestions(book)
    );
  },

  async generateCompetitorAnalysis(book: Book, scrapedContext?: string) {
    return withFallback(
      'generateCompetitorAnalysis',
      () => groqAiService.generateCompetitorAnalysis(book, scrapedContext),
      () => localAiService.generateCompetitorAnalysis(book)
    );
  },

  async generateAdCopy(book: Book, segment: string, platform: string) {
    return withFallback(
      'generateAdCopy',
      () => groqAiService.generateAdCopy(book, segment, platform),
      () => localAiService.generateAdCopy(book, segment, platform)
    );
  },

  async generateTikTokScript(book: Book) {
    return withFallback(
      'generateTikTokScript',
      () => groqAiService.generateTikTokScript(book),
      () => localAiService.generateTikTokScript(book)
    );
  },

  async generateEmailCopy(book: Book) {
    return withFallback(
      'generateEmailCopy',
      () => groqAiService.generateEmailCopy(book),
      () => localAiService.generateEmailCopy(book)
    );
  },

  async generateDiscussionGuide(book: Book) {
    return withFallback(
      'generateDiscussionGuide',
      () => groqAiService.generateDiscussionGuide(book),
      () => localAiService.generateDiscussionGuide(book)
    );
  },

  async generatePodcastPitch(book: Book) {
    return withFallback(
      'generatePodcastPitch',
      () => groqAiService.generatePodcastPitch(book),
      () => localAiService.generatePodcastPitch(book)
    );
  },

  async generateRedditPost(book: Book) {
    return withFallback(
      'generateRedditPost',
      () => groqAiService.generateRedditPost(book),
      () => localAiService.generateRedditPost(book)
    );
  },

  async generateCalendar(book: Book, days: number) {
    return withFallback(
      'generateCalendar',
      () => groqAiService.generateCalendar(book, days),
      () => localAiService.generateCalendar(book, days)
    );
  },
};