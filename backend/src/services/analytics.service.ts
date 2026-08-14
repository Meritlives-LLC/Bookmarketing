import { analyticsRepository } from '../repositories/analytics.repository';
import { bookRepository } from '../repositories/book.repository';
import { AppError } from '../utils/helpers';

function computeRoas(spend: number, revenue: number): number {
  if (spend <= 0) return 0;
  return Number((revenue / spend).toFixed(2));
}

export const analyticsService = {
  async getForBook(bookId: string, userId: string, from?: Date, to?: Date) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');

    const snapshots = await analyticsRepository.findForBook(bookId, from, to);
    const totals = await analyticsRepository.aggregateForBook(bookId, from, to);

    const spend = Number(totals.spend ?? 0);
    const revenue = Number(totals.revenue ?? 0);
    const clicks = totals.clicks ?? 0;

    return {
      snapshots,
      totals: {
        impressions: totals.impressions ?? 0,
        clicks,
        conversions: totals.conversions ?? 0,
        spend,
        revenue,
        cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
        roas: computeRoas(spend, revenue),
      },
    };
  },

  async recordSnapshot(bookId: string, platform: string, date: Date, metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
    revenue: number;
  }) {
    return analyticsRepository.upsertSnapshot({
      bookId,
      platform: platform as never,
      date,
      ...metrics,
    });
  },
};
