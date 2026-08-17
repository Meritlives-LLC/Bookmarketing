import { Worker } from 'bullmq';
import { requireBullConnection } from '../queues/connection';
import { processManuscriptExtractionJob } from '../queues/processors/manuscript.processor';
import { processBookVideoJob } from '../queues/processors/book-video.processor';
import { logger } from '../utils/logger';
import { connectDatabase } from '../config/database';

async function start() {
  const connection = requireBullConnection();
  await connectDatabase();
  const manuscriptWorker = new Worker('book-manuscript', processManuscriptExtractionJob, {
    connection: connection.connection, concurrency: 2,
  });
  manuscriptWorker.on('completed', (job) => logger.info('Manuscript extraction completed', { jobId: job.id }));
  manuscriptWorker.on('failed', (job, err) => logger.error('Manuscript extraction failed', { jobId: job?.id, error: err.message }));
  const videoWorker = new Worker('book-video', processBookVideoJob, {
    connection: connection.connection, concurrency: 3,
  });
  videoWorker.on('completed', (job) => logger.info('Book-video job completed', { jobId: job.id, name: job.name }));
  videoWorker.on('failed', (job, err) => logger.error('Book-video job failed', { jobId: job?.id, name: job?.name, error: err.message }));
  logger.info('Book-video worker started (queues: book-manuscript, book-video)');
}
start().catch((error) => {
  logger.error('Failed to start book-video worker', { error: (error as Error).message });
  process.exit(1);
});
