import cron from 'node-cron';
import { prisma } from '../config/database';
import { emailService } from '../services/email.service';
import { analyticsService } from '../services/analytics.service';
import { logger } from '../utils/logger';

export function scheduleWeeklyReport(): void {
  // Runs every Monday at 08:00 Africa/Lagos time
  cron.schedule(
    '0 8 * * 1',
    async () => {
      logger.info('Running weekly report cron');
      const books = await prisma.book.findMany({ include: { user: true } });

      for (const book of books) {
        try {
          const { totals } = await analyticsService.getForBook(book.id, book.userId);
          await emailService.send(
            book.user.email,
            `Weekly performance report — ${book.title}`,
            `Impressions: ${totals.impressions}, Clicks: ${totals.clicks}, Conversions: ${totals.conversions}, ROAS: ${totals.roas}`
          );
        } catch (error) {
          logger.error('Failed to send weekly report', { bookId: book.id, error });
        }
      }
    },
    { timezone: 'Africa/Lagos' }
  );
}
