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

  async aggregateForBook(bookId: string) {
    const result = await prisma.analyticsSnapshot.aggregate({
      where: { bookId },
      _sum: { impressions: true, clicks: true, conversions: true, spend: true, revenue: true },
    });
    return result._sum;
  },
};
