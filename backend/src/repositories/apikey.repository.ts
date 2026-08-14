import { prisma } from '../config/database';

export const apiKeyRepository = {
  create(userId: string, name: string, keyHash: string, keyPrefix: string) {
    return prisma.apiKey.create({ data: { userId, name, keyHash, keyPrefix } });
  },

  findManyForUser(userId: string) {
    return prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.apiKey.findFirst({ where: { id, userId } });
  },

  findByHash(keyHash: string) {
    return prisma.apiKey.findUnique({ where: { keyHash } });
  },

  touchLastUsed(id: string) {
    return prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  },

  revoke(id: string) {
    return prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  },
};
