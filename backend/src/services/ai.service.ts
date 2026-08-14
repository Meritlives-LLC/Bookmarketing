/**
 * `aiService` is the stable entry point every consumer (audit worker,
 * creative service, calendar service, etc.) imports — none of them need to
 * know or care which backend actually produced the content.
 *
 * Backend selection:
 *  - `GROQ_API_KEY` set  → try `groqAiService` (real LLM, Groq's free tier).
 *  - not set, or a Groq call fails/times out/returns bad JSON → fall back to
 *    `localAiService` (offline, template + NLP based, zero cost, zero
 *    network dependency — see `local-ai.service.ts`).
 *
 * This keeps the app fully functional with no API key and no network access
 * (the original design goal of `localAiService`), while producing genuinely
 * generated, audience-research-grounded copy whenever Groq is reachable.
 */
import { Book } from '@prisma/client';
import { config } from '../config';
import { localAiService } from './local-ai.service';
import { groqAiService } from './groq-ai.service';
import { logger } from '../utils/logger';

async function withFallback<T>(label: string, groqCall: () => Promise<T>, localCall: () => Promise<T>): Promise<T> {
  if (!config.ai.groq.enabled) {
    return localCall();
  }
  try {
    return await groqCall();
  } catch (error) {
    logger.warn(`Groq call failed for ${label}, falling back to local-ai`, {
      error: (error as Error).message,
    });
    return localCall();
  }
}

export const aiService = {
  async generateAudienceInsight(book: Book, segment: string, platform: string, scrapedContext?: string) {
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