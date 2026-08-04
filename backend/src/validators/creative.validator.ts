import { z } from 'zod';
import { CreativeType, ReaderSegment, Platform } from '@prisma/client';

export const generateCreativeSchema = z.object({
  bookId: z.string().uuid(),
  type: z.nativeEnum(CreativeType),
  segment: z.nativeEnum(ReaderSegment).optional(),
  platform: z.nativeEnum(Platform).optional(),
  count: z.number().int().positive().max(30).optional(),
});

export type GenerateCreativeSchema = z.infer<typeof generateCreativeSchema>;
