import { z } from 'zod';

export const createAuditSchema = z.object({
  bookId: z.string().uuid(),
});

export type CreateAuditSchema = z.infer<typeof createAuditSchema>;
