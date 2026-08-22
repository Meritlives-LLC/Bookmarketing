import {
  Prisma,
  User,
} from '@prisma/client';

import {
  prisma,
} from '../config/database';

export const userRepository = {
  findById(
    id: string,
  ): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  findByIdWithSubscription(
    id: string,
  ) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        subscription: true,
      },
    });
  },

  updatePreferences(
    id: string,
    preferences: Record<
      string,
      boolean
    >,
  ) {
    return prisma.user.update({
      where: { id },
      data: {
        emailPreferences:
          preferences,
      },
    });
  },

  findByEmail(
    email: string,
  ): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  /*
   * emailVerifyToken now contains the SHA-256
   * hash, never the raw verification token.
   */
  findByEmailVerifyToken(
    tokenHash: string,
  ): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        emailVerifyToken:
          tokenHash,
      },
    });
  },

  create(
    data: Prisma.UserCreateInput,
  ): Promise<User> {
    return prisma.user.create({
      data,
    });
  },

  update(
    id: string,
    data: Prisma.UserUpdateInput,
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  updateLastLogin(
    id: string,
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
      },
    });
  },

  bumpTokenVersion(
    id: string,
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        tokenVersion: {
          increment: 1,
        },
      },
    });
  },

  setResetToken(
    id: string,
    tokenHash: string,
    expires: Date,
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        resetToken: tokenHash,
        resetTokenExpires:
          expires,
      },
    });
  },

  findByResetToken(
    tokenHash: string,
  ): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        resetToken: tokenHash,
        resetTokenExpires: {
          gt: new Date(),
        },
      },
    });
  },

  clearResetToken(
    id: string,
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        resetToken: null,
        resetTokenExpires: null,
      },
    });
  },

  decrementCredits(
    id: string,
    amount = 1,
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        credits: {
          decrement: amount,
        },
      },
    });
  },

  incrementCredits(
    id: string,
    amount: number,
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        credits: {
          increment: amount,
        },
      },
    });
  },
};