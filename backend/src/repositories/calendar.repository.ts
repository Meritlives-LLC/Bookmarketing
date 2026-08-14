import { CalendarEvent, CalendarEventStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const calendarRepository = {
  create(data: Prisma.CalendarEventUncheckedCreateInput): Promise<CalendarEvent> {
    return prisma.calendarEvent.create({ data });
  },

  findById(id: string): Promise<CalendarEvent | null> {
    return prisma.calendarEvent.findUnique({ where: { id } });
  },

  findByIdForUser(id: string, userId: string): Promise<CalendarEvent | null> {
    return prisma.calendarEvent.findFirst({ where: { id, book: { userId } } });
  },

  findManyForBook(bookId: string, from?: Date, to?: Date) {
    return prisma.calendarEvent.findMany({
      where: {
        bookId,
        ...(from || to
          ? {
              scheduledAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { scheduledAt: 'asc' },
      include: { creative: true },
    });
  },

  update(id: string, data: Prisma.CalendarEventUpdateInput): Promise<CalendarEvent> {
    return prisma.calendarEvent.update({ where: { id }, data });
  },

  /** Future, still-scheduled events for a book on a given platform — the pool eligible to be auto-paused. */
  findUpcomingScheduledForBookAndPlatform(bookId: string, platform: Prisma.CalendarEventWhereInput['platform']) {
    return prisma.calendarEvent.findMany({
      where: { bookId, platform, status: CalendarEventStatus.SCHEDULED, scheduledAt: { gte: new Date() } },
    });
  },

  markCompleted(id: string): Promise<CalendarEvent> {
    return prisma.calendarEvent.update({
      where: { id },
      data: { status: CalendarEventStatus.PUBLISHED, completedAt: new Date() },
    });
  },

  delete(id: string): Promise<CalendarEvent> {
    return prisma.calendarEvent.delete({ where: { id } });
  },
};