import { z } from 'zod';
import { CalendarEventStatus, Platform } from '@prisma/client';

export const createCalendarEventSchema = z.object({
  bookId: z.string().uuid(),
  platform: z.nativeEnum(Platform),
  scheduledAt: z.coerce.date(),
  creativeId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export const generateCalendarSchema = z.object({
  bookId: z.string().uuid(),
  days: z.number().int().positive().max(180).optional(),
});

// Explicit allowlist — a calendar event's bookId/platform/creativeId are not
// editable in place (delete + recreate if that's needed); only these three
// fields are meant to be updatable, matching what the service already types
// as CalendarEventUpdateInput. Wiring this in stops the route from accepting
// arbitrary Prisma.CalendarEventUpdateInput fields straight from the body.
export const updateCalendarEventSchema = z
  .object({
    scheduledAt: z.coerce.date().optional(),
    notes: z.string().max(2000).optional(),
    status: z.nativeEnum(CalendarEventStatus).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateCalendarEventSchema = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventSchema = z.infer<typeof updateCalendarEventSchema>;
