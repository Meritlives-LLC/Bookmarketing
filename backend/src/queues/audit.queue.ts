import { Queue } from 'bullmq';
import { bullConnection } from './connection';
import { AuditJobData } from '../types/audit.types';

export const auditQueue = new Queue<AuditJobData>('audit-processing', bullConnection);

export async function enqueueAuditJob(data: AuditJobData) {
  return auditQueue.add('run-audit', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
