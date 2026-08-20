import { Worker } from 'bullmq';
import { requireBullConnection } from '../queues/connection';
import { processManuscriptExtractionJob } from '../queues/processors/manuscript.processor';
import { processBookVideoJob } from '../queues/processors/book-video.processor';
import { logger } from '../utils/logger';
import { connectDatabase } from '../config/database';
import { reconcileStuckBookVideoWork } from './reconcile-book-video';

async function start() {
  const connection = requireBullConnection();
  await connectDatabase();
  // Resume any Book-to-Film work orphaned by a prior crash/restart before
  // accepting new jobs, so a project doesn't stay stuck in an in-progress
  // status indefinitely just because the job that was driving it is gone.
  await reconcileStuckBookVideoWork();
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
