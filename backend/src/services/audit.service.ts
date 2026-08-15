import { AuditStatus, ReaderSegment, Platform } from '@prisma/client';
import { auditRepository } from '../repositories/audit.repository';
import { bookRepository } from '../repositories/book.repository';
import { AppError } from '../utils/helpers';
import { aiService } from './ai.service';
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

function readersForPlatform(all: ScrapedReader[], platform: Platform): ScrapedReader[] {
  const map: Partial<Record<Platform, ScrapedReader['source'][]>> = {
    [Platform.GOODREADS]: ['goodreads'],
    [Platform.AMAZON]: ['amazon'],
    [Platform.REDDIT]: ['reddit'],
    [Platform.YOUTUBE]: ['reddit', 'goodreads'],
    [Platform.TIKTOK]: ['reddit', 'amazon'],
    [Platform.FACEBOOK]: ['reddit', 'goodreads'],
    [Platform.EMAIL]: ['goodreads', 'amazon'],
    [Platform.PODCAST]: ['reddit', 'goodreads'],
    [Platform.INSTAGRAM]: ['amazon', 'reddit'],
  };
  const allowed = map[platform];
  const filtered = allowed ? all.filter((r) => allowed.includes(r.source)) : all;
  return (filtered.length ? filtered : all).slice(0, 6);
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

      const [goodreadsResult, amazonResult, redditResult] = await Promise.allSettled([
        book.goodreadsUrl
          ? scraperService.scrapeGoodreads(book.goodreadsUrl)
          : Promise.resolve(null),
        book.amazonUrl ? scraperService.scrapeAmazon(book.amazonUrl) : Promise.resolve(null),
        scraperService.scrapeRedditMentions(searchQuery),
      ]);

      const settled = [
        goodreadsResult.status === 'fulfilled' ? goodreadsResult.value : null,
        amazonResult.status === 'fulfilled' ? amazonResult.value : null,
        redditResult.status === 'fulfilled' ? redditResult.value : null,
      ];

      const scrapedContext = combineScrapedContext(settled);
      const allReaders = collectReaders(settled);

      await auditRepository.updateStatus(auditId, AuditStatus.ANALYZING);

      const insights = await Promise.all(
        SEGMENT_PLATFORM_MAP.map(async ({ segment, platform }) => {
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

          return {
            segment,
            platform,
            summary: result.summary,
            data: {
              ...result.data,
              sampleReaders,
              groundedInScrape: Boolean(scrapedContext),
            },
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