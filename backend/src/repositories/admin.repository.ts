import { Prisma, UserRole, AuditStatus } from '@prisma/client';
import { prisma } from '../config/database';

export const adminRepository = {
  async stats() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [userCount, bookCount, auditCount, creativeCount, newUsersLast7d, byPlan, byRole] =
      await Promise.all([
        prisma.user.count(),
        prisma.book.count(),
        prisma.audit.count(),
        prisma.creative.count(),
        prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.subscription.groupBy({ by: ['plan'], _count: { _all: true } }),
        prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      ]);

    return { userCount, bookCount, auditCount, creativeCount, newUsersLast7d, byPlan, byRole };
  },

  findUsers(search: string | undefined, skip: number, take: number) {
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    return Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          credits: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          subscription: { select: { plan: true, status: true } },
          _count: { select: { books: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  updateUser(id: string, data: { role?: UserRole; credits?: number }) {
    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        credits: true,
      },
    });
  },

  deleteUser(id: string) {
    return prisma.user.delete({ where: { id } });
  },

  findBooks(search: string | undefined, skip: number, take: number) {
    const where: Prisma.BookWhereInput = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    return Promise.all([
      prisma.book.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          genre: true,
          createdAt: true,
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          _count: { select: { audits: true, creatives: true } },
        },
      }),
      prisma.book.count({ where }),
    ]);
  },

  findBookById(id: string) {
    return prisma.book.findUnique({ where: { id } });
  },

  deleteBook(id: string) {
    return prisma.book.delete({ where: { id } });
  },

  findAudits(status: AuditStatus | undefined, skip: number, take: number) {
    const where: Prisma.AuditWhereInput = status ? { status } : {};

    return Promise.all([
      prisma.audit.findMany({
        where,
        skip,
        take,
        orderBy: { requestedAt: 'desc' },
        select: {
          id: true,
          status: true,
          requestedAt: true,
          completedAt: true,
          errorMessage: true,
          book: {
            select: { id: true, title: true, user: { select: { email: true } } },
          },
        },
      }),
      prisma.audit.count({ where }),
    ]);
  },
};
