import { Queue } from 'bullmq';
import { bullConnection } from './connection';
import { CreativeJobData } from '../types/creative.types';
import { logger } from '../utils/logger';

export const creativeQueue: Queue<CreativeJobData> | null = bullConnection
  ? new Queue<CreativeJobData>('creative-generation', bullConnection)
  : null;

export async function enqueueCreativeJob(data: CreativeJobData) {
  if (!creativeQueue) {
    logger.warn('Redis not configured — creative job not enqueued', { bookId: data.bookId });
    return null;
  }
  return creativeQueue.add('generate-creative', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}