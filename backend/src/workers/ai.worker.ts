import { Worker } from 'bullmq';
import { bullConnection } from '../queues/connection';
import { processCreativeJob } from '../queues/processors/creative.processor';
import { logger } from '../utils/logger';
import { connectDatabase } from '../config/database';

async function start() {
  await connectDatabase();

  const worker = new Worker('creative-generation', processCreativeJob, {
    ...bullConnection,
    concurrency: 5,
  });

  worker.on('completed', (job) => logger.info('Creative job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('Creative job failed', { jobId: job?.id, error: err.message }));

  logger.info('AI/creative worker started');
}

start().catch((error) => {
  logger.error('Failed to start AI worker', { error });
  process.exit(1);
});
