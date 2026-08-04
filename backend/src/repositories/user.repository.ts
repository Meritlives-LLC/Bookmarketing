import { Prisma, User } from '@prisma/client';
import { prisma } from '../config/database';

export const userRepository = {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
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
