import { Worker } from 'bullmq';
import { requireBullConnection } from '../queues/connection';
import { processCreativeJob } from '../queues/processors/creative.processor';
import { logger } from '../utils/logger';
import { connectDatabase, disconnectDatabase } from '../config/database';

async function start() {
  const connection = requireBullConnection();
  await connectDatabase();

  const worker = new Worker('creative-generation', processCreativeJob, {
    connection: connection.connection,
    concurrency: 5,
  });

  worker.on('completed', (job) => logger.info('Creative job completed', { jobId: job.id }));
  worker.on('failed', (job, err) =>
    logger.error('Creative job failed', { jobId: job?.id, error: err.message })
  );

  logger.info('AI/creative worker started');

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, closing AI worker gracefully...`);
    await worker.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  logger.error('Failed to start AI worker', { error: (error as Error).message });
  process.exit(1);
});