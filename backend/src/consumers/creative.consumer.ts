import { creativeQueue } from '../queues/creative.queue';
import { logger } from '../utils/logger';

export function startCreativeConsumer(): void {
  const queue = creativeQueue;
  if (!queue) {
    return;
  }
  queue.on('waiting', (jobId) => {
    logger.info('Creative job waiting', { jobId });
  });
}