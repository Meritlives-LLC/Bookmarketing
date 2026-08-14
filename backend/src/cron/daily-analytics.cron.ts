import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { optimizationService } from '../services/optimization.service';

export function scheduleDailyAnalytics(): void {
  // Runs every day at 02:00 Africa/Lagos time
  cron.schedule(
    '0 2 * * *',
    async () => {
      logger.info('Running daily analytics refresh cron');
      const books = await prisma.book.findMany({ select: { id: true } });
      logger.info(`Daily analytics refresh queued for ${books.length} books`);
      // NOTE: there's no connected ad-platform account anywhere in this codebase yet,
      // so there's no external spend/revenue data to pull in here — that part of this
      // cron stays a placeholder until a real ad-account integration exists. What *is*
      // real: auto-optimization over whatever analytics the user has already recorded.

      const results = await optimizationService.runForAllBooks();
      const pausedCreatives = results.reduce((sum, r) => sum + (r.result?.pausedCreatives.length ?? 0), 0);
      const canceledEvents = results.reduce((sum, r) => sum + (r.result?.canceledEvents.length ?? 0), 0);
      logger.info('Daily auto-optimization completed', {
        booksProcessed: results.length,
        pausedCreatives,
        canceledEvents,
      });
    },
    { timezone: 'Africa/Lagos' }
  );
}