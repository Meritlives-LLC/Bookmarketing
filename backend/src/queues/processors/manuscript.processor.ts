import { Job } from 'bullmq';
import { manuscriptService } from '../../services/manuscript.service';
import { ManuscriptJobData } from '../../types/book-video.types';
import { logger } from '../../utils/logger';

export async function processManuscriptExtractionJob(job: Job<ManuscriptJobData>): Promise<void> {
  logger.info('Processing manuscript extraction job', {
    jobId: job.id,
    manuscriptId: job.data.manuscriptId,
  });
  await manuscriptService.processExtraction(job.data.manuscriptId);
}
