import { Queue } from 'bullmq';
import { bullConnection, isRedisConfigured } from './connection';
import { AuditJobData } from '../types/audit.types';
import { logger } from '../utils/logger';

export const auditQueue: Queue<AuditJobData> | null =
  isRedisConfigured && bullConnection
    ? new Queue<AuditJobData>('audit-processing', bullConnection)
    : null;

export async function enqueueAuditJob(data: AuditJobData) {
  if (!auditQueue) {
    logger.warn('Redis not configured — audit job not enqueued', { auditId: data.auditId });
    return null;
  }
  return auditQueue.add('run-audit', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}