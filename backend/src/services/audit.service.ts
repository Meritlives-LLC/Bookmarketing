import { AuditStatus, ReaderSegment, Platform } from '@prisma/client';
import { auditRepository } from '../repositories/audit.repository';
import { bookRepository } from '../repositories/book.repository';
import { AppError } from '../utils/helpers';
import { aiService } from './ai.service';
import { inferTargetRegions, buildPersonas } from './audience-meta.service';
import {
  scraperService,
  combineScrapedContext,
  collectReaders,
  ScrapedReader,
} from './scraper.service';
import { logger } from '../utils/logger';

/** All 12 Prisma ReaderSegment values */
const SEGMENT_PLATFORM_MAP: Array<{ segment: ReaderSegment; platform: Platform }> = [
  { segment: ReaderSegment.BOOKTOK, platform: Platform.TIKTOK },
  { segment: ReaderSegment.GOODREADS_POWER_READER, platform: Platform.GOODREADS },
  { segment: ReaderSegment.AMAZON_SEARCH_SHOPPER, platform: Platform.AMAZON },
  { segment: ReaderSegment.REDDIT_COMMUNITY, platform: Platform.REDDIT },
  { segment: ReaderSegment.BOOKTUBE_VIEWER, platform: Platform.YOUTUBE },
  { segment: ReaderSegment.NEWSLETTER_SUBSCRIBER, platform: Platform.EMAIL },
  { segment: ReaderSegment.FACEBOOK_GROUP, platform: Platform.FACEBOOK },
  { segment: ReaderSegment.PODCAST_LISTENER, platform: Platform.PODCAST },
  { segment: ReaderSegment.BOOK_CLUB, platform: Platform.FACEBOOK },
  { segment: ReaderSegment.CORPORATE_HR, platform: Platform.EMAIL },
  { segment: ReaderSegment.EDUCATIONAL, platform: Platform.AMAZON },
  { segment: ReaderSegment.LIBRARY, platform: Platform.GOODREADS },
];

/** Pause between Groq calls to stay under free-tier TPM (~8k/min). */
const GROQ_GAP_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readersForPlatform(all: ScrapedReader[], platform: Platform): ScrapedReader[] {
  const map: Partial<Record<Platform, ScrapedReader['source'][]>> = {
    [Platform.GOODREADS]: ['goodreads'],
    [Platform.AMAZON]: ['amazon'],
    [Platform.REDDIT]: ['reddit', 'twitter'],
    [Platform.YOUTUBE]: ['youtube'],
    [Platform.TIKTOK]: ['twitter', 'reddit', 'youtube'],
    [Platform.FACEBOOK]: ['reddit', 'goodreads', 'twitter'],
    [Platform.EMAIL]: ['goodreads', 'amazon'],
    [Platform.PODCAST]: ['youtube', 'reddit', 'twitter'],
    [Platform.INSTAGRAM]: ['twitter', 'youtube'],
  };
  const allowed = map[platform];
  const filtered = allowed ? all.filter((r) => allowed.includes(r.source)) : all;
  return (filtered.length ? filtered : all).slice(0, 6);
}

function safeSummary(
  summary: unknown,
  segment: ReaderSegment,
  platform: Platform
): string {
  if (typeof summary === 'string' && summary.trim()) return summary.trim();
  return `Audience insight for ${segment.replace(/_/g, ' ').toLowerCase()} on ${platform.toLowerCase()}.`;
}

function safeConfidence(confidence: unknown): number {
  if (typeof confidence === 'number' && Number.isFinite(confidence)) {
    return Math.min(1, Math.max(0, confidence));
  }
  return 0.4;
}

export const auditService = {
  async create(bookId: string, userId: string) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');

    const audit = await auditRepository.create(bookId);
    return audit;
  },

  async getById(id: string, userId: string) {
    const audit = await auditRepository.findByIdForUser(id, userId);
    if (!audit) throw AppError.notFound('Audit not found');
    return audit;
  },

  async listByBook(bookId: string, userId: string) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');
    return auditRepository.findByBookIdForUser(bookId, userId);
  },

  async run(auditId: string): Promise<void> {
    const audit = await auditRepository.findById(auditId);
    if (!audit) {
      logger.error('Audit not found for processing', { auditId });
      return;
    }

    try {
      await auditRepository.updateStatus(auditId, AuditStatus.SCRAPING);

      const book = audit.book;
      const searchQuery = [book.title, book.genre.replace(/_/g, ' ')].filter(Boolean).join(' ');

      const [goodreadsResult, amazonResult, redditResult, youtubeResult, twitterResult] =
        await Promise.allSettled([
          book.goodreadsUrl
            ? scraperService.scrapeGoodreads(book.goodreadsUrl)
            : Promise.resolve(null),
          book.amazonUrl ? scraperService.scrapeAmazon(book.amazonUrl) : Promise.resolve(null),
          scraperService.scrapeRedditMentions(searchQuery),
          scraperService.scrapeYouTubeSearch(`${book.title} book review`),
          scraperService.scrapeTwitterSentiment(book.title),
        ]);

      const settled = [
        goodreadsResult.status === 'fulfilled' ? goodreadsResult.value : null,
        amazonResult.status === 'fulfilled' ? amazonResult.value : null,
        redditResult.status === 'fulfilled' ? redditResult.value : null,
        youtubeResult.status === 'fulfilled' ? youtubeResult.value : null,
        twitterResult.status === 'fulfilled' ? twitterResult.value : null,
      ];

      const scrapedContext = combineScrapedContext(settled);
      const allReaders = collectReaders(settled);
      const twitter = settled[4];

      logger.info('Audit scrape complete', {
        auditId,
        sourcesOk: settled.filter((r) => r && !r.error).length,
        fromCache: settled.filter((r) => r && r.fromCache).length,
        readerCount: allReaders.length,
      });

      await auditRepository.updateStatus(auditId, AuditStatus.ANALYZING);

      // Sequential Groq calls — parallel Promise.all blows free-tier TPM
      const insights: Array<{
        segment: ReaderSegment;
        platform: Platform;
        summary: string;
        data: Record<string, unknown>;
        confidence: number;
      }> = [];

      for (let i = 0; i < SEGMENT_PLATFORM_MAP.length; i++) {
        const { segment, platform } = SEGMENT_PLATFORM_MAP[i];

        const result = await aiService.generateAudienceInsight(
          book,
          segment,
          platform,
          scrapedContext
        );

        const sampleReaders = readersForPlatform(allReaders, platform).map((r) => ({
          name: r.name,
          source: r.source,
          quote: r.quote,
          profileUrl: r.profileUrl,
          rating: r.rating,
        }));

        const targetRegions = inferTargetRegions(book, segment);
        const personas = buildPersonas(book, segment, readersForPlatform(allReaders, platform), targetRegions);

        insights.push({
          segment,
          platform,
          summary: safeSummary(result.summary, segment, platform),
          data: {
            ...(result.data && typeof result.data === 'object' ? result.data : {}),
            sampleReaders,
            personas,
            targetRegions,
            groundedInScrape: Boolean(scrapedContext),
            twitterSentiment:
              twitter && !twitter.error ? twitter.sentimentSummary : undefined,
          },
          confidence: safeConfidence(result.confidence),
        });

        if (i < SEGMENT_PLATFORM_MAP.length - 1) {
          await sleep(GROQ_GAP_MS);
        }
      }

      await auditRepository.addAudienceInsights(auditId, insights);

      await sleep(GROQ_GAP_MS);
      const keywordResult = await aiService.generateKeywordSuggestions(book, scrapedContext);
      await auditRepository.addKeywordSuggestions(
        auditId,
        (keywordResult.keywords ?? []).map((k) => ({
          keyword: k.keyword || 'untitled',
          searchVolume: k.searchVolume ?? null,
          suggestedBid: k.suggestedBid ?? null,
          competition: k.competition ?? null,
          platform: Platform.AMAZON,
        }))
      );

      await sleep(GROQ_GAP_MS);
      const competitorResult = await aiService.generateCompetitorAnalysis(book, scrapedContext);
      await auditRepository.addCompetitorAnalyses(
        auditId,
        (competitorResult.competitors ?? []).map((c) => ({
          competitorName: c.competitorName || 'Unknown competitor',
          strengths: Array.isArray(c.strengths) ? c.strengths : [],
          weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses : [],
        }))
      );

      await auditRepository.markCompleted(auditId);
    } catch (error) {
      logger.error('Audit processing failed', { auditId, error });
      await auditRepository.markFailed(auditId, (error as Error).message);
    }
  },
};