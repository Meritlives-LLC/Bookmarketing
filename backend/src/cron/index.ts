import { connectDatabase } from '../config/database';
import { scheduleDailyAnalytics } from './daily-analytics.cron';
import { scheduleWeeklyReport } from './weekly-report.cron';
import { scheduleCleanup } from './cleanup.cron';
import { logger } from '../utils/logger';

async function start() {
  await connectDatabase();

  scheduleDailyAnalytics();
  scheduleWeeklyReport();
  scheduleCleanup();

  logger.info('Cron scheduler started (Africa/Lagos)');
}

start().catch((error) => {
  logger.error('Failed to start cron scheduler', { error });
  process.exit(1);
});
