import { Worker } from 'bullmq';
import { requireBullConnection } from '../queues/connection';
import { analyticsService } from '../services/analytics.service';
import { logger } from '../utils/logger';
import { connectDatabase } from '../config/database';

interface AnalyticsJobData {
  bookId: string;
  platform: string;
  date: string;
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
    revenue: number;
  };
}

async function start() {
  const connection = requireBullConnection();
  await connectDatabase();

  const worker = new Worker<AnalyticsJobData>(
    'analytics-refresh',
    async (job) => {
      await analyticsService.recordSnapshot(
        job.data.bookId,
        job.data.platform,
        new Date(job.data.date),
        job.data.metrics
      );
    },
    {
      connection: connection.connection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => logger.info('Analytics job completed', { jobId: job.id }));
  worker.on('failed', (job, err) =>
    logger.error('Analytics job failed', { jobId: job?.id, error: err.message })
  );

  logger.info('Analytics worker started');
}

start().catch((error) => {
  logger.error('Failed to start analytics worker', { error: (error as Error).message });
  process.exit(1);
});