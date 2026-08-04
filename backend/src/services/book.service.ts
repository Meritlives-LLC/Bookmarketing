import { bookRepository } from '../repositories/book.repository';
import { AppError } from '../utils/helpers';
import { paginate, buildPaginationMeta } from '../utils/formatter';
import { CreateBookInput, UpdateBookInput, BookListFilters } from '../types/book.types';

export const bookService = {
  async create(userId: string, input: CreateBookInput) {
    return bookRepository.create(userId, input);
  },

  async getById(id: string, userId: string) {
    const book = await bookRepository.findByIdForUser(id, userId);
    if (!book) throw AppError.notFound('Book not found');
    return book;
  },

  async list(userId: string, filters: BookListFilters, page: number, limit: number) {
    const { skip, take } = paginate(page, limit);
    const { books, total } = await bookRepository.findManyForUser(userId, filters, skip, take);
    return { books, meta: buildPaginationMeta(total, page ?? 1, take) };
  },

  async update(id: string, userId: string, input: UpdateBookInput) {
    await this.getById(id, userId);
    return bookRepository.update(id, input);
  },

  async remove(id: string, userId: string) {
    await this.getById(id, userId);
    await bookRepository.delete(id);
  },
};
