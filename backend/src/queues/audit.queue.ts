import { Queue } from 'bullmq';
import { bullConnection } from './connection';
import { AuditJobData } from '../types/audit.types';
import { logger } from '../utils/logger';
import { auditService } from '../services/audit.service';

export const auditQueue: Queue<AuditJobData> | null = bullConnection
  ? new Queue<AuditJobData>('audit-processing', bullConnection)
  : null;

/**
 * Run the audit inline in this process first — regardless of whether Redis
 * is configured. Only if the inline run fails do we fall back to enqueuing
 * it on BullMQ (when Redis is available) so the audit worker can retry it
 * with backoff. If Redis isn't configured, a failed inline run just logs.
 */
export async function enqueueAuditJob(data: AuditJobData) {
  logger.info('Running audit inline', {
    auditId: data.auditId,
    bookId: data.bookId,
  });

  // Do not await: let the HTTP response return 202 while work continues.
  setImmediate(() => {
    auditService.run(data.auditId).catch((error) => {
      logger.error('Inline audit failed', {
        auditId: data.auditId,
        error: (error as Error).message,
      });

      if (!auditQueue) {
        return;
      }

      logger.warn('Falling back to Redis queue for audit retry', {
        auditId: data.auditId,
        bookId: data.bookId,
      });

      auditQueue
        .add('run-audit', data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        })
        .catch((queueError) => {
          logger.error('Redis fallback enqueue also failed', {
            auditId: data.auditId,
            error: (queueError as Error).message,
          });
        });
    });
  });

  return null;
}