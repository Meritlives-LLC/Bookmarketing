import { auditQueue } from '../queues/audit.queue';
import { logger } from '../utils/logger';

export function startAuditConsumer(): void {
  auditQueue.on('waiting', (jobId) => {
    logger.info('Audit job waiting', { jobId });
  });
}
