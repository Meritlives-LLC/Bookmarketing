import { Queue } from 'bullmq';
import { bullConnection } from './connection';

export interface CalendarJobData {
  bookId: string;
  days: number;
}

export const calendarQueue = new Queue<CalendarJobData>('calendar-generation', bullConnection);

export async function enqueueCalendarJob(data: CalendarJobData) {
  return calendarQueue.add('generate-calendar', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  });
}
