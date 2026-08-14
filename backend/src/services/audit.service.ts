import { AuditStatus, ReaderSegment, Platform } from '@prisma/client';
import { auditRepository } from '../repositories/audit.repository';
import { bookRepository } from '../repositories/book.repository';
import { AppError } from '../utils/helpers';
import { aiService } from './ai.service';
import { scraperService, combineScrapedContext } from './scraper.service';
import { logger } from '../utils/logger';

const SEGMENT_PLATFORM_MAP: Array<{ segment: ReaderSegment; platform: Platform }> = [
  { segment: ReaderSegment.BOOKTOK, platform: Platform.TIKTOK },
  { segment: ReaderSegment.GOODREADS_POWER_READER, platform: Platform.GOODREADS },
  { segment: ReaderSegment.AMAZON_SEARCH_SHOPPER, platform: Platform.AMAZON },
  { segment: ReaderSegment.REDDIT_COMMUNITY, platform: Platform.REDDIT },
  { segment: ReaderSegment.BOOKTUBE_VIEWER, platform: Platform.YOUTUBE },
  { segment: ReaderSegment.NEWSLETTER_SUBSCRIBER, platform: Platform.EMAIL },
  { segment: ReaderSegment.FACEBOOK_GROUP, platform: Platform.FACEBOOK },
];

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

      const [goodreadsResult, amazonResult, redditResult] = await Promise.allSettled([
        book.goodreadsUrl ? scraperService.scrapeGoodreads(book.goodreadsUrl) : Promise.resolve(null),
        book.amazonUrl ? scraperService.scrapeAmazon(book.amazonUrl) : Promise.resolve(null),
        scraperService.scrapeRedditMentions(book.genre),
      ]);

      // Feed what was actually scraped into the AI step as grounding context
      // instead of discarding it — a settled-but-null/errored scrape just
      // contributes nothing, it doesn't fail the audit.
      const scrapedContext = combineScrapedContext([
        goodreadsResult.status === 'fulfilled' ? goodreadsResult.value : null,
        amazonResult.status === 'fulfilled' ? amazonResult.value : null,
        redditResult.status === 'fulfilled' ? redditResult.value : null,
      ]);

      await auditRepository.updateStatus(auditId, AuditStatus.ANALYZING);

      const insights = await Promise.all(
        SEGMENT_PLATFORM_MAP.map(async ({ segment, platform }) => {
          const result = await aiService.generateAudienceInsight(book, segment, platform, scrapedContext);
          return {
            segment,
            platform,
            summary: result.summary,
            data: result.data,
            confidence: result.confidence,
          };
        })
      );
      await auditRepository.addAudienceInsights(auditId, insights);

      const keywordResult = await aiService.generateKeywordSuggestions(book, scrapedContext);
      await auditRepository.addKeywordSuggestions(
        auditId,
        keywordResult.keywords.map((k) => ({ ...k, platform: Platform.AMAZON }))
      );

      const competitorResult = await aiService.generateCompetitorAnalysis(book, scrapedContext);
      await auditRepository.addCompetitorAnalyses(auditId, competitorResult.competitors);

      await auditRepository.markCompleted(auditId);
    } catch (error) {
      logger.error('Audit processing failed', { auditId, error });
      await auditRepository.markFailed(auditId, (error as Error).message);
    }
  },
};