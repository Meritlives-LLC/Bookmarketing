import { z } from 'zod';
import { BookGenre } from '@prisma/client';

export const createBookSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300),
  subtitle: z.string().max(300).optional(),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  genre: z.nativeEnum(BookGenre),
  coverImageUrl: z.string().url().optional(),
  amazonUrl: z.string().url().optional(),
  goodreadsUrl: z.string().url().optional(),
  asin: z.string().max(20).optional(),
  isbn: z.string().max(20).optional(),
  price: z.number().positive().optional(),
});

export const updateBookSchema = createBookSchema.partial();

export const bookListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  genre: z.nativeEnum(BookGenre).optional(),
  search: z.string().optional(),
});

export type CreateBookSchema = z.infer<typeof createBookSchema>;
export type UpdateBookSchema = z.infer<typeof updateBookSchema>;
