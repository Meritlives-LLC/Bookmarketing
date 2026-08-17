import { Queue } from 'bullmq';
import { bullConnection } from './connection';
import { ManuscriptJobData } from '../types/book-video.types';
import { logger } from '../utils/logger';

export const bookManuscriptQueue: Queue<ManuscriptJobData> | null = bullConnection
  ? new Queue<ManuscriptJobData>('book-manuscript', bullConnection)
  : null;

export async function enqueueManuscriptExtractionJob(data: ManuscriptJobData) {
  if (!bookManuscriptQueue) {
    logger.warn('Redis not configured — manuscript extraction not enqueued', {
      manuscriptId: data.manuscriptId,
    });
    return null;
  }
  return bookManuscriptQueue.add('extract-manuscript', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
