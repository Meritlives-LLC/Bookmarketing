import { bookRepository } from "../repositories/book.repository";
import { AppError } from "../utils/helpers";
import { paginate, buildPaginationMeta } from "../utils/formatter";
import { enrichBookIdsFromUrls } from "../utils/book-url";
import { resolveCoverImageUrl } from "../utils/book-cover";
import {
  CreateBookInput,
  UpdateBookInput,
  BookListFilters,
} from "../types/book.types";
import { logger } from "../utils/logger";

export const bookService = {
  async create(userId: string, input: CreateBookInput) {
    const enriched = enrichBookIdsFromUrls(input);

    let coverImageUrl = enriched.coverImageUrl || undefined;
    try {
      const resolved = await resolveCoverImageUrl({
        coverImageUrl,
        isbn: enriched.isbn,
        asin: enriched.asin,
        title: enriched.title,
      });
      if (resolved) coverImageUrl = resolved;
    } catch (error) {
      logger.warn("Cover resolve failed on create", {
        error: (error as Error).message,
      });
    }

    return bookRepository.create(userId, {
      ...enriched,
      coverImageUrl,
    });
  },

  async getById(id: string, userId: string) {
    const book = await bookRepository.findByIdForUser(id, userId);
    if (!book) throw AppError.notFound("Book not found");
    return book;
  },

  async list(userId: string, filters: BookListFilters, page: number, limit: number) {
    const { skip, take } = paginate(page, limit);
    const { books, total } = await bookRepository.findManyForUser(
      userId,
      filters,
      skip,
      take
    );
    return { books, meta: buildPaginationMeta(total, page ?? 1, take) };
  },

  async update(id: string, userId: string, input: UpdateBookInput) {
    await this.getById(id, userId);
    const enriched = enrichBookIdsFromUrls(input);

    let coverImageUrl = enriched.coverImageUrl;
    if (!coverImageUrl) {
      try {
        coverImageUrl = await resolveCoverImageUrl({
          coverImageUrl: null,
          isbn: enriched.isbn,
          asin: enriched.asin,
          title: typeof enriched.title === "string" ? enriched.title : undefined,
        });
      } catch (error) {
        logger.warn("Cover resolve failed on update", {
          error: (error as Error).message,
        });
      }
    }

    return bookRepository.update(id, {
      ...enriched,
      ...(coverImageUrl ? { coverImageUrl } : {}),
    });
  },

  async remove(id: string, userId: string) {
    await this.getById(id, userId);
    await bookRepository.delete(id);
  },
};