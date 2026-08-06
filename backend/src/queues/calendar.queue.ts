import { Queue } from 'bullmq';
import { bullConnection, isRedisConfigured } from './connection';
import { logger } from '../utils/logger';

export interface CalendarJobData {
  bookId: string;
  days: number;
}

export const calendarQueue: Queue<CalendarJobData> | null =
  isRedisConfigured && bullConnection
    ? new Queue<CalendarJobData>('calendar-generation', bullConnection)
    : null;

export async function enqueueCalendarJob(data: CalendarJobData) {
  if (!calendarQueue) {
    logger.warn('Redis not configured — calendar job not enqueued', { bookId: data.bookId });
    return null;
  }
  return calendarQueue.add('generate-calendar', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  });
}