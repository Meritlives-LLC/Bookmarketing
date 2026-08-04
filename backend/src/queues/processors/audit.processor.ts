import { Job } from 'bullmq';
import { auditService } from '../../services/audit.service';
import { AuditJobData } from '../../types/audit.types';
import { logger } from '../../utils/logger';

export async function processAuditJob(job: Job<AuditJobData>): Promise<void> {
  logger.info('Processing audit job', { jobId: job.id, auditId: job.data.auditId });
  await auditService.run(job.data.auditId);
}
