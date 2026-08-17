import { Manuscript, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const manuscriptRepository = {
  create(data: Prisma.ManuscriptUncheckedCreateInput): Promise<Manuscript> {
    return prisma.manuscript.create({ data });
  },

  findById(id: string): Promise<Manuscript | null> {
    return prisma.manuscript.findUnique({ where: { id } });
  },

  findByBookId(bookId: string): Promise<Manuscript | null> {
    return prisma.manuscript.findUnique({ where: { bookId } });
  },

  /** Ownership-scoped lookup — every read the frontend can trigger must go through this, not findById. */
  findByBookIdForUser(bookId: string, userId: string): Promise<Manuscript | null> {
    return prisma.manuscript.findFirst({ where: { bookId, book: { userId } } });
  },

  update(id: string, data: Prisma.ManuscriptUpdateInput): Promise<Manuscript> {
    return prisma.manuscript.update({ where: { id }, data });
  },

  /** Cascades to Chapter rows via the FK — the S3 object must be deleted separately by the caller. */
  delete(id: string): Promise<Manuscript> {
    return prisma.manuscript.delete({ where: { id } });
  },
};
