import { Queue } from 'bullmq';
import { bullConnection } from './connection';
import { CreativeJobData } from '../types/creative.types';

export const creativeQueue = new Queue<CreativeJobData>('creative-generation', bullConnection);

export async function enqueueCreativeJob(data: CreativeJobData) {
  return creativeQueue.add('generate-creative', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
