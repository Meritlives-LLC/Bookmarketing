import { z } from "zod";

export const bookSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  subtitle: z.string().max(300).optional(),
  description: z.string().min(10, "Description must be at least 10 characters"),
  genre: z.string().min(1),
  amazonUrl: z.string().url().optional().or(z.literal("")),
  goodreadsUrl: z.string().url().optional().or(z.literal("")),
  asin: z.string().optional(),
  isbn: z.string().optional(),
  price: z.coerce.number().positive().optional(),
});

export type BookFormValues = z.infer<typeof bookSchema>;
