import { AuditStatus, CreativeStatus, CreativeType, Prisma, ReaderSegment } from '@prisma/client';
import { creativeRepository } from '../repositories/creative.repository';
import { bookRepository } from '../repositories/book.repository';
import { prisma } from '../config/database';
import { AppError } from '../utils/helpers';
import { aiService } from './ai.service';
import { logger } from '../utils/logger';
import { GenerateCreativeInput } from '../types/creative.types';
import { paginate, buildPaginationMeta } from '../utils/formatter';

/**
 * Pull real persona / sample-reader notes from the latest completed audit.
 * Used to ground Ad Suite copy in scraped audience data (no generic archetypes).
 */
async function loadPersonaNotesForBook(
  bookId: string,
  segment?: ReaderSegment | null
): Promise<string | undefined> {
  try {
    const audits = await prisma.audit.findMany({
      where: { bookId },
      orderBy: { requestedAt: 'desc' },
      take: 5,
      include: { audienceInsights: true },
    });

    const completed =
      audits.find((a: { status: AuditStatus }) => a.status === AuditStatus.COMPLETED) ??
      audits[0];
    if (!completed?.audienceInsights?.length) return undefined;

    const insights = completed.audienceInsights as Array<{
      segment?: string;
      summary?: string;
      data?: Record<string, unknown> | null;
    }>;

    const preferred = segment
      ? insights.filter((i) => i.segment === segment)
      : insights;
    const pool = preferred.length ? preferred : insights;

    const lines: string[] = [];
    for (const ins of pool.slice(0, 4)) {
      if (ins.summary) lines.push(`Segment ${ins.segment}: ${ins.summary}`);
      const data = (ins.data || {}) as Record<string, unknown>;
      const readers = Array.isArray(data.sampleReaders) ? data.sampleReaders : [];
      const personas = Array.isArray(data.personas) ? data.personas : [];
      for (const r of readers.slice(0, 3) as Array<{ name?: string; quote?: string; source?: string }>) {
        if (r.quote) {
          lines.push(
            `Reader (${r.source || 'scrape'}) ${r.name || ''}: "${String(r.quote).slice(0, 160)}"`
          );
        }
      }
      for (const p of personas.slice(0, 3) as Array<{
        label?: string;
        motivation?: string;
        evidenceQuote?: string;
      }>) {
        const q = p.evidenceQuote || p.motivation;
        if (q) lines.push(`Persona ${p.label || ''}: ${String(q).slice(0, 160)}`);
      }
    }
    return lines.length ? lines.join('\n') : undefined;
  } catch (err) {
    logger.warn('Could not load persona notes for ad suite', {
      bookId,
      error: (err as Error).message,
    });
    return undefined;
  }
}

export const creativeService = {
  async create(userId: string, input: GenerateCreativeInput) {
    const book = await bookRepository.findByIdForUser(input.bookId, userId);
    if (!book) throw AppError.notFound('Book not found');

    const creative = await creativeRepository.create({
      bookId: input.bookId,
      type: input.type,
      segment: input.segment,
      platform: input.platform,
      status: CreativeStatus.GENERATING,
      content: {},
    });

    // fire-and-forget generation; in production this goes through the queue
    this.generate(creative.id).catch((error) =>
      logger.error('Creative generation failed', { creativeId: creative.id, error })
    );

    return creative;
  },

  async generate(creativeId: string): Promise<void> {
    const creative = await creativeRepository.findById(creativeId);
    if (!creative) return;

    const book = await bookRepository.findById(creative.bookId);
    if (!book) return;

    try {
      let content: Record<string, unknown> = {};
      let title: string | undefined;

      switch (creative.type) {
        case CreativeType.IMAGE_AD:
        case CreativeType.VIDEO_AD: {
          const ad = await aiService.generateAdCopy(
            book,
            creative.segment ?? 'general readers',
            creative.platform ?? 'Facebook'
          );
          content = ad;
          title = ad.headline;
          break;
        }
        case CreativeType.TIKTOK_VIDEO: {
          const script = await aiService.generateTikTokScript(book);
          content = { script };
          title = `TikTok script — ${book.title}`;
          break;
        }
        case CreativeType.EMAIL_COPY: {
          const email = await aiService.generateEmailCopy(book);
          content = email;
          title = email.subject;
          break;
        }
        case CreativeType.DISCUSSION_GUIDE: {
          const guide = await aiService.generateDiscussionGuide(book);
          content = { guide };
          title = `Discussion guide — ${book.title}`;
          break;
        }
        case CreativeType.AMAZON_KEYWORDS: {
          const keywords = await aiService.generateKeywordSuggestions(book);
          content = keywords;
          title = `Amazon keywords — ${book.title}`;
          break;
        }
        case CreativeType.PODCAST_PITCH: {
          const pitch = await aiService.generatePodcastPitch(book);
          content = pitch;
          title = pitch.subject;
          break;
        }
        case CreativeType.REDDIT_POST: {
          const post = await aiService.generateRedditPost(book);
          content = post;
          title = post.title;
          break;
        }
        case CreativeType.AD_SUITE: {
          const personaNotes = await loadPersonaNotesForBook(book.id, creative.segment);
          const suite = await aiService.generateAdSuite(
            book,
            creative.segment ?? undefined,
            personaNotes
          );
          content = suite as unknown as Record<string, unknown>;
          title = `Ad suite — ${book.title}`;
          break;
        }
        default: {
          const ad = await aiService.generateAdCopy(
            book,
            creative.segment ?? 'general readers',
            creative.platform ?? 'general'
          );
          content = ad;
          title = ad.headline;
        }
      }

      await creativeRepository.updateStatus(creativeId, CreativeStatus.READY, {
        content: content as Prisma.InputJsonValue,
        title,
      });
    } catch (error) {
      logger.error('Creative generation error', { creativeId, error });
      await creativeRepository.updateStatus(creativeId, CreativeStatus.FAILED);
    }
  },

  async getById(id: string, userId: string) {
    const creative = await creativeRepository.findByIdForUser(id, userId);
    if (!creative) throw AppError.notFound('Creative not found');
    return creative;
  },

  async list(userId: string, bookId: string, page: number, limit: number) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');
    const { skip, take } = paginate(page, limit);
    const { creatives, total } = await creativeRepository.findManyForBook(bookId, skip, take);
    return { creatives, meta: buildPaginationMeta(total, page ?? 1, take) };
  },

  async update(id: string, userId: string, data: { title?: string; content?: Record<string, unknown> }) {
    const creative = await creativeRepository.findByIdForUser(id, userId);
    if (!creative) throw AppError.notFound('Creative not found');
    return creativeRepository.update(id, {
      ...data,
      content: data.content as Prisma.InputJsonValue | undefined,
    });
  },

  async remove(id: string, userId: string) {
    const creative = await creativeRepository.findByIdForUser(id, userId);
    if (!creative) throw AppError.notFound('Creative not found');
    await creativeRepository.delete(id);
  },
};