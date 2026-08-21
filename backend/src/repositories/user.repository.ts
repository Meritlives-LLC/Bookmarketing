import { Prisma, User } from '@prisma/client';
import { prisma } from '../config/database';

export const userRepository = {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  findByIdWithSubscription(id: string) {
    return prisma.user.findUnique({ where: { id }, include: { subscription: true } });
  },

  updatePreferences(id: string, preferences: Record<string, boolean>) {
    return prisma.user.update({
      where: { id },
      data: { emailPreferences: preferences },
    });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findByEmailVerifyToken(token: string): Promise<User | null> {
    return prisma.user.findFirst({ where: { emailVerifyToken: token } });
  },

  create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  },

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  },

  updateLastLogin(id: string): Promise<User> {
    return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  },

  /** Invalidates every outstanding refresh token for this user (logout, password reset). */
  bumpTokenVersion(id: string): Promise<User> {
    return prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
  },

  setResetToken(id: string, token: string, expires: Date): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { resetToken: token, resetTokenExpires: expires },
    });
  },

  findByResetToken(token: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpires: { gt: new Date() } },
    });
  },

  clearResetToken(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { resetToken: null, resetTokenExpires: null },
    });
  },

  decrementCredits(id: string, amount = 1): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { credits: { decrement: amount } },
    });
  },

  incrementCredits(id: string, amount: number): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { credits: { increment: amount } },
    });
  },
};
