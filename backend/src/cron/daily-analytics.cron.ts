import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export function scheduleDailyAnalytics(): void {
  // Runs every day at 02:00 Africa/Lagos time
  cron.schedule(
    '0 2 * * *',
    async () => {
      logger.info('Running daily analytics refresh cron');
      const books = await prisma.book.findMany({ select: { id: true } });
      logger.info(`Daily analytics refresh queued for ${books.length} books`);
      // In production this would enqueue analytics-refresh jobs per book/platform
      // by calling the ad platform APIs and pushing results through the analytics queue.
    },
    { timezone: 'Africa/Lagos' }
  );
}
