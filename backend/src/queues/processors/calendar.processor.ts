import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { calendarService } from '../../services/calendar.service';
import { CalendarJobData } from '../calendar.queue';
import { logger } from '../../utils/logger';

export async function processCalendarJob(job: Job<CalendarJobData>): Promise<void> {
  logger.info('Processing calendar job', { jobId: job.id, bookId: job.data.bookId });
  const book = await prisma.book.findUnique({ where: { id: job.data.bookId } });
  if (!book) return;
  await calendarService.generatePlan(book.userId, job.data.bookId, job.data.days);
}
