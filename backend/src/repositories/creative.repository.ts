import { Creative, CreativeStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const creativeRepository = {
  create(data: Prisma.CreativeUncheckedCreateInput): Promise<Creative> {
    return prisma.creative.create({ data });
  },

  findById(id: string): Promise<Creative | null> {
    return prisma.creative.findUnique({ where: { id } });
  },

  findByIdForUser(id: string, userId: string): Promise<Creative | null> {
    return prisma.creative.findFirst({ where: { id, book: { userId } } });
  },

  async findManyForBook(
    bookId: string,
    skip: number,
    take: number
  ): Promise<{ creatives: Creative[]; total: number }> {
    const where: Prisma.CreativeWhereInput = { bookId };
    const [creatives, total] = await Promise.all([
      prisma.creative.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.creative.count({ where }),
    ]);
    return { creatives, total };
  },

  updateStatus(id: string, status: CreativeStatus, extra: Prisma.CreativeUpdateInput = {}) {
    return prisma.creative.update({ where: { id }, data: { status, ...extra } });
  },

  /** Active (READY/PUBLISHED) creatives for a book on a given platform — the pool eligible to be auto-paused. */
  findActiveForBookAndPlatform(bookId: string, platform: Prisma.CreativeWhereInput['platform']) {
    return prisma.creative.findMany({
      where: { bookId, platform, status: { in: [CreativeStatus.READY, CreativeStatus.PUBLISHED] } },
    });
  },

  archiveMany(ids: string[]) {
    return prisma.creative.updateMany({ where: { id: { in: ids } }, data: { status: CreativeStatus.ARCHIVED } });
  },

  update(id: string, data: Prisma.CreativeUpdateInput): Promise<Creative> {
    return prisma.creative.update({ where: { id }, data });
  },

  delete(id: string): Promise<Creative> {
    return prisma.creative.delete({ where: { id } });
  },
};