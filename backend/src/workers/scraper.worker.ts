import { Worker } from 'bullmq';
import { bullConnection } from '../queues/connection';
import { processAuditJob } from '../queues/processors/audit.processor';
import { logger } from '../utils/logger';
import { connectDatabase } from '../config/database';

async function start() {
  await connectDatabase();

  const worker = new Worker('audit-processing', processAuditJob, {
    ...bullConnection,
    concurrency: 3,
  });

  worker.on('completed', (job) => logger.info('Audit job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('Audit job failed', { jobId: job?.id, error: err.message }));

  logger.info('Scraper/audit worker started');
}

start().catch((error) => {
  logger.error('Failed to start audit worker', { error });
  process.exit(1);
});
