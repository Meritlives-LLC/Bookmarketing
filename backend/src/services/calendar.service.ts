import { CalendarEventStatus } from '@prisma/client';
import { calendarRepository } from '../repositories/calendar.repository';
import { bookRepository } from '../repositories/book.repository';
import { AppError } from '../utils/helpers';
import { aiService } from './ai.service';

export const calendarService = {
  async create(userId: string, bookId: string, data: { platform: string; scheduledAt: Date; creativeId?: string; notes?: string }) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');

    return calendarRepository.create({
      bookId,
      platform: data.platform as never,
      scheduledAt: data.scheduledAt,
      creativeId: data.creativeId,
      notes: data.notes,
    });
  },

  async generatePlan(userId: string, bookId: string, days = 30) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');

    const plan = await aiService.generateCalendar(book, days);
    const now = new Date();

    const events = await Promise.all(
      plan.events.map((e) => {
        const scheduledAt = new Date(now.getTime() + e.day * 24 * 60 * 60 * 1000);
        return calendarRepository.create({
          bookId,
          platform: (e.platform.toUpperCase() as never) ?? 'FACEBOOK',
          scheduledAt,
          notes: e.action,
        });
      })
    );

    return events;
  },

  async list(userId: string, bookId: string, page: number, limit: number) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');
    const { skip, take } = paginate(page, limit);
    const { creatives, total } = await creativeRepository.findManyForBook(bookId, skip, take);
    return { creatives, meta: buildPaginationMeta(total, page ?? 1, take) };
  },

  async getById(id: string, userId: string) {
    const event = await calendarRepository.findByIdForUser(id, userId);
    if (!event) throw AppError.notFound('Calendar event not found');
    return event;
  },

  async update(id: string, userId: string, data: Partial<{ scheduledAt: Date; notes: string; status: CalendarEventStatus }>) {
    await this.getById(id, userId);
    return calendarRepository.update(id, data);
  },

  async complete(id: string, userId: string) {
    await this.getById(id, userId);
    return calendarRepository.markCompleted(id);
  },

  async remove(id: string, userId: string) {
    await this.getById(id, userId);
    await calendarRepository.delete(id);
  },
};