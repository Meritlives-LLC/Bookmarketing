import { Worker } from 'bullmq';
import { requireBullConnection } from '../queues/connection';
import { processAuditJob } from '../queues/processors/audit.processor';
import { logger } from '../utils/logger';
import { connectDatabase, disconnectDatabase } from '../config/database';

async function start() {
  const connection = requireBullConnection();
  await connectDatabase();

  const worker = new Worker('audit-processing', processAuditJob, {
    connection: connection.connection,
    concurrency: 3,
  });

  worker.on('completed', (job) => logger.info('Audit job completed', { jobId: job.id }));
  worker.on('failed', (job, err) =>
    logger.error('Audit job failed', { jobId: job?.id, error: err.message })
  );

  logger.info('Scraper/audit worker started');

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, closing scraper/audit worker gracefully...`);
    await worker.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  logger.error('Failed to start audit worker', { error: (error as Error).message });
  process.exit(1);
});