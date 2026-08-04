import { Job } from 'bullmq';
import { creativeService } from '../../services/creative.service';
import { CreativeJobData } from '../../types/creative.types';
import { logger } from '../../utils/logger';

export async function processCreativeJob(job: Job<CreativeJobData>): Promise<void> {
  logger.info('Processing creative job', { jobId: job.id, creativeId: job.data.creativeId });
  await creativeService.generate(job.data.creativeId);
}
