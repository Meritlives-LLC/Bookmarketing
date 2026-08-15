import { Queue } from 'bullmq';
import { bullConnection } from './connection';
import { AuditJobData } from '../types/audit.types';
import { logger } from '../utils/logger';
import { auditService } from '../services/audit.service';

export const auditQueue: Queue<AuditJobData> | null = bullConnection
  ? new Queue<AuditJobData>('audit-processing', bullConnection)
  : null;

/**
 * Enqueue an audit job on BullMQ when Redis is available.
 * When Redis is not configured, run the audit inline in the API process
 * so status still moves Pending → Scraping → Analyzing → Completed.
 */
export async function enqueueAuditJob(data: AuditJobData) {
  if (auditQueue) {
    return auditQueue.add('run-audit', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  // Hybrid fallback: no Redis / no worker — process in this process.
  logger.warn('Redis not configured — running audit inline (no queue)', {
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
    });
  });

  return null;
}