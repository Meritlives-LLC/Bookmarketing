import { auditQueue } from '../queues/audit.queue';
import { logger } from '../utils/logger';

export function startAuditConsumer(): void {
  const queue = auditQueue;
  if (!queue) {
    return;
  }
  queue.on('waiting', (jobId) => {
    logger.info('Audit job waiting', { jobId });
  });
}