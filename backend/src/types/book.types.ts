import { BookGenre } from '@prisma/client';

export interface CreateBookInput {
  title: string;
  subtitle?: string;
  description: string;
  genre: BookGenre;
  coverImageUrl?: string;
  amazonUrl?: string;
  goodreadsUrl?: string;
  asin?: string;
  isbn?: string;
  price?: number;
}

export type UpdateBookInput = Partial<CreateBookInput>;

export interface BookListFilters {
  genre?: BookGenre;
  search?: string;
}
