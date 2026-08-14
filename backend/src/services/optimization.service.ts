/**
 * Implements the "Auto Optimization" behavior promised on the marketing
 * site ("underperforming creatives are paused, budget shifts to winners"):
 *
 *  - Pausing: for each platform with meaningful spend and a ROAS below
 *    `MIN_ROAS`, any READY/PUBLISHED creative and any still-upcoming
 *    SCHEDULED calendar event on that platform is paused (Creative →
 *    ARCHIVED, CalendarEvent → CANCELED).
 *  - Budget shift: rather than actually moving money — there's no
 *    connected ad-platform account anywhere in this codebase, so nothing
 *    here can touch a real Facebook/Amazon ad budget — this computes a
 *    concrete reallocation *recommendation*: how much of the underperforming
 *    platforms' spend should move to the winning platforms, weighted by
 *    their relative ROAS.
 *
 * This is real, deterministic logic over the user's own recorded
 * analytics (see `analytics.service.ts`), not a network call to an ad
 * platform — that integration doesn't exist yet.
 */
import { Platform, CalendarEventStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { analyticsRepository } from '../repositories/analytics.repository';
import { creativeRepository } from '../repositories/creative.repository';
import { calendarRepository } from '../repositories/calendar.repository';
import { bookRepository } from '../repositories/book.repository';
import { AppError } from '../utils/helpers';
import { logger } from '../utils/logger';

/** Below this ROAS a platform is considered underperforming (spend isn't earning it back). */
const MIN_ROAS = 1.0;
/** Ignore platforms with too little spend to draw a reliable conclusion from. */
const MIN_SPEND_TO_JUDGE = 20;

export interface PlatformPerformance {
  platform: Platform;
  spend: number;
  revenue: number;
  roas: number;
  status: 'winning' | 'underperforming' | 'insufficient-data';
}

export interface BudgetShiftRecommendation {
  fromPlatform: Platform;
  toPlatform: Platform;
  suggestedShiftAmount: number;
  reason: string;
}

export interface OptimizationResult {
  platformPerformance: PlatformPerformance[];
  pausedCreatives: { id: string; platform: Platform; title: string | null }[];
  canceledEvents: { id: string; platform: Platform; scheduledAt: Date }[];
  recommendations: BudgetShiftRecommendation[];
  ranAt: Date;
}

function classify(spend: number, revenue: number): PlatformPerformance['status'] {
  if (spend < MIN_SPEND_TO_JUDGE) return 'insufficient-data';
  const roas = spend > 0 ? revenue / spend : 0;
  return roas < MIN_ROAS ? 'underperforming' : 'winning';
}

export const optimizationService = {
  /**
   * Analyzes a book's platform performance and pauses underperforming
   * creatives/calendar events. Returns what it did plus budget-shift
   * recommendations, so a caller (API response or cron log) can surface it.
   */
  async runForBook(bookId: string, userId?: string): Promise<OptimizationResult> {
    const book = userId ? await bookRepository.findByIdForUser(bookId, userId) : await bookRepository.findById(bookId);
    if (!book) throw AppError.notFound('Book not found');

    const platformTotals = await analyticsRepository.aggregateByPlatformForBook(bookId);

    const performance: PlatformPerformance[] = platformTotals.map((p) => {
      const roas = p.spend > 0 ? Number((p.revenue / p.spend).toFixed(2)) : 0;
      return {
        platform: p.platform,
        spend: p.spend,
        revenue: p.revenue,
        roas,
        status: classify(p.spend, p.revenue),
      };
    });

    const underperforming = performance.filter((p) => p.status === 'underperforming');
    const winning = performance.filter((p) => p.status === 'winning');

    // ── Pause underperforming creatives + upcoming events ──────────────
    const pausedCreatives: OptimizationResult['pausedCreatives'] = [];
    const canceledEvents: OptimizationResult['canceledEvents'] = [];

    for (const p of underperforming) {
      const creatives = await creativeRepository.findActiveForBookAndPlatform(bookId, p.platform);
      if (creatives.length) {
        await creativeRepository.archiveMany(creatives.map((c) => c.id));
        pausedCreatives.push(...creatives.map((c) => ({ id: c.id, platform: p.platform, title: c.title })));
      }

      const events = await calendarRepository.findUpcomingScheduledForBookAndPlatform(bookId, p.platform);
      for (const event of events) {
        const autoNote = `Auto-paused: ${p.platform} ROAS ${p.roas.toFixed(2)}x is below the ${MIN_ROAS.toFixed(1)}x target.`;
        await calendarRepository.update(event.id, {
          status: CalendarEventStatus.CANCELED,
          notes: event.notes ? `${event.notes}\n\n${autoNote}` : autoNote,
        });
        canceledEvents.push({ id: event.id, platform: p.platform, scheduledAt: event.scheduledAt });
      }
    }

    // ── Budget-shift recommendations ────────────────────────────────
    // Move each underperformer's spend to winners, weighted by each
    // winner's share of total winning-platform ROAS (so the strongest
    // performer gets the largest share of the reallocated spend).
    const recommendations: BudgetShiftRecommendation[] = [];
    if (underperforming.length && winning.length) {
      const totalWinningRoas = winning.reduce((sum, w) => sum + w.roas, 0) || winning.length;
      for (const under of underperforming) {
        if (under.spend <= 0) continue;
        for (const win of winning) {
          const weight = totalWinningRoas > 0 ? win.roas / totalWinningRoas : 1 / winning.length;
          const suggestedShiftAmount = Number((under.spend * weight).toFixed(2));
          if (suggestedShiftAmount <= 0) continue;
          recommendations.push({
            fromPlatform: under.platform,
            toPlatform: win.platform,
            suggestedShiftAmount,
            reason: `${under.platform} is returning ${under.roas.toFixed(2)}x while ${win.platform} is returning ${win.roas.toFixed(2)}x — shifting spend toward the stronger performer.`,
          });
        }
      }
    }

    logger.info('Optimization run completed', {
      bookId,
      pausedCreatives: pausedCreatives.length,
      canceledEvents: canceledEvents.length,
      recommendations: recommendations.length,
    });

    return {
      platformPerformance: performance,
      pausedCreatives,
      canceledEvents,
      recommendations,
      ranAt: new Date(),
    };
  },

  /** Runs optimization for every book in the system — used by the daily cron. */
  async runForAllBooks(): Promise<{ bookId: string; result?: OptimizationResult; error?: string }[]> {
    const books = await prisma.book.findMany({ select: { id: true } });
    const results: { bookId: string; result?: OptimizationResult; error?: string }[] = [];

    for (const { id: bookId } of books) {
      try {
        const result = await this.runForBook(bookId);
        results.push({ bookId, result });
      } catch (error) {
        logger.error('Optimization run failed for book', { bookId, error: (error as Error).message });
        results.push({ bookId, error: (error as Error).message });
      }
    }

    return results;
  },
};