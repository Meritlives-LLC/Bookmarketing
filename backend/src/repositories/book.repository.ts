import { Prisma, Book } from '@prisma/client';
import { prisma } from '../config/database';
import { BookListFilters } from '../types/book.types';

export const bookRepository = {
  create(userId: string, data: Prisma.BookCreateWithoutUserInput): Promise<Book> {
    return prisma.book.create({
      data: { ...data, user: { connect: { id: userId } } },
    });
  },

  findById(id: string): Promise<Book | null> {
    return prisma.book.findUnique({ where: { id } });
  },

  findByIdForUser(id: string, userId: string): Promise<Book | null> {
    return prisma.book.findFirst({ where: { id, userId } });
  },

  async findManyForUser(
    userId: string,
    filters: BookListFilters,
    skip: number,
    take: number
  ): Promise<{ books: Book[]; total: number }> {
    const where: Prisma.BookWhereInput = {
      userId,
      ...(filters.genre ? { genre: filters.genre } : {}),
      ...(filters.search
        ? {
            OR: [
              { title: { contains: filters.search, mode: 'insensitive' } },
              { description: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.book.count({ where }),
    ]);

    return { books, total };
  },

  update(id: string, data: Prisma.BookUpdateInput): Promise<Book> {
    return prisma.book.update({ where: { id }, data });
  },

  delete(id: string): Promise<Book> {
    return prisma.book.delete({ where: { id } });
  },
};
