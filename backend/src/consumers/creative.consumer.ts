import { creativeQueue } from '../queues/creative.queue';
import { logger } from '../utils/logger';

export function startCreativeConsumer(): void {
  creativeQueue.on('waiting', (jobId) => {
    logger.info('Creative job waiting', { jobId });
  });
}
