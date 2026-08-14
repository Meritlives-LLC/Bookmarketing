import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const analyticsRepository = {
  upsertSnapshot(data: Prisma.AnalyticsSnapshotUncheckedCreateInput) {
    return prisma.analyticsSnapshot.upsert({
      where: {
        bookId_platform_date: {
          bookId: data.bookId,
          platform: data.platform,
          date: data.date as Date,
        },
      },
      create: data,
      update: {
        impressions: data.impressions,
        clicks: data.clicks,
        conversions: data.conversions,
        spend: data.spend,
        revenue: data.revenue,
      },
    });
  },

  findForBook(bookId: string, from?: Date, to?: Date) {
    return prisma.analyticsSnapshot.findMany({
      where: {
        bookId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
    });
  },

  async aggregateForBook(bookId: string, from?: Date, to?: Date) {
    const result = await prisma.analyticsSnapshot.aggregate({
      where: {
        bookId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      _sum: { impressions: true, clicks: true, conversions: true, spend: true, revenue: true },
    });
    return result._sum;
  },

  /** Per-platform totals for a book, used by the optimization engine to compare platform performance. */
  async aggregateByPlatformForBook(bookId: string, from?: Date, to?: Date) {
    const result = await prisma.analyticsSnapshot.groupBy({
      by: ['platform'],
      where: {
        bookId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      _sum: { impressions: true, clicks: true, conversions: true, spend: true, revenue: true },
    });
    return result.map((r) => ({
      platform: r.platform,
      impressions: r._sum.impressions ?? 0,
      clicks: r._sum.clicks ?? 0,
      conversions: r._sum.conversions ?? 0,
      spend: Number(r._sum.spend ?? 0),
      revenue: Number(r._sum.revenue ?? 0),
    }));
  },
};