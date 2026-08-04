import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export function scheduleCleanup(): void {
  // Runs every day at 03:00 Africa/Lagos time
  cron.schedule(
    '0 3 * * *',
    async () => {
      logger.info('Running cleanup cron');
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const deletedNotifications = await prisma.notification.deleteMany({
        where: { read: true, createdAt: { lt: cutoff } },
      });

      const deletedFailedCreatives = await prisma.creative.deleteMany({
        where: { status: 'FAILED', updatedAt: { lt: cutoff } },
      });

      logger.info('Cleanup finished', {
        notifications: deletedNotifications.count,
        creatives: deletedFailedCreatives.count,
      });
    },
    { timezone: 'Africa/Lagos' }
  );
}
