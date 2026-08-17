import { Worker } from 'bullmq';
import { requireBullConnection } from '../queues/connection';
import { processManuscriptExtractionJob } from '../queues/processors/manuscript.processor';
import { logger } from '../utils/logger';
import { connectDatabase } from '../config/database';

/**
 * Dedicated worker process for the AI Book-to-Video / Film Studio feature.
 * Kept separate from ai.worker.ts (creative-generation jobs) per spec §26 —
 * book-video jobs are heavier (manuscript parsing, later: scene planning,
 * video generation, FFmpeg rendering) and shouldn't compete with or be
 * starved by the marketing-creative queue's concurrency settings.
 *
 * Each pipeline stage gets its own BullMQ Worker registered here as it's
 * built (analysis, film-bible, scene-planning, reference-generation,
 * video-generation, narration-generation, video-render — see spec §25).
 * Concurrency is set per-queue: extraction/analysis are CPU/memory-bound
 * (keep low on constrained hosts), whereas polling a video provider's
 * status is mostly I/O-bound and can run with higher concurrency.
 */
async function start() {
  const connection = requireBullConnection();
  await connectDatabase();

  const manuscriptWorker = new Worker('book-manuscript', processManuscriptExtractionJob, {
    connection: connection.connection,
    concurrency: 2,
  });

  manuscriptWorker.on('completed', (job) =>
    logger.info('Manuscript extraction job completed', { jobId: job.id })
  );
  manuscriptWorker.on('failed', (job, err) =>
    logger.error('Manuscript extraction job failed', { jobId: job?.id, error: err.message })
  );

  logger.info('Book-video worker started (queues: book-manuscript)');
}

start().catch((error) => {
  logger.error('Failed to start book-video worker', { error: (error as Error).message });
  process.exit(1);
});
