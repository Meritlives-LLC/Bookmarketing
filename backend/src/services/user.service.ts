import jwt from 'jsonwebtoken';
import { config } from '../config';
import { userRepository } from '../repositories/user.repository';
import {
  hashPassword,
  comparePassword,
  generateRandomToken,
  hashToken,
} from '../utils/crypto';
import { AppError } from '../utils/helpers';
import {
  RegisterInput,
  LoginInput,
  JwtPayload,
} from '../types/user.types';
import { User } from '@prisma/client';

function signAccessToken(user: User): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(
    payload,
    config.jwt.accessSecret,
    {
      expiresIn:
        config.jwt.accessExpiresIn,
    },
  );
}

function signRefreshToken(user: User): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  };

  return jwt.sign(
    payload,
    config.jwt.refreshSecret,
    {
      expiresIn:
        config.jwt.refreshExpiresIn,
    },
  );
}

export const authService = {
  async register(
    input: RegisterInput,
  ) {
    const existing =
      await userRepository.findByEmail(
        input.email,
      );

    if (existing) {
      throw AppError.conflict(
        'An account with this email already exists',
        'EMAIL_TAKEN',
      );
    }

    const passwordHash =
      await hashPassword(
        input.password,
      );

    /*
     * Raw token is ONLY sent to the email
     * recipient. The database receives only
     * its SHA-256 hash.
     */
    const emailVerifyToken =
      generateRandomToken(32);

    const emailVerifyTokenHash =
      hashToken(
        emailVerifyToken,
      );

    const user =
      await userRepository.create({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        emailVerifyToken:
          emailVerifyTokenHash,
      });

    const accessToken =
      signAccessToken(user);

    const refreshToken =
      signRefreshToken(user);

    return {
      user,
      accessToken,
      refreshToken,
      emailVerifyToken,
    };
  },

  async login(
    input: LoginInput,
  ) {
    const user =
      await userRepository.findByEmail(
        input.email,
      );

    if (!user) {
      throw AppError.unauthorized(
        'Invalid email or password',
        'INVALID_CREDENTIALS',
      );
    }

    const valid =
      await comparePassword(
        input.password,
        user.passwordHash,
      );

    if (!valid) {
      throw AppError.unauthorized(
        'Invalid email or password',
        'INVALID_CREDENTIALS',
      );
    }

    await userRepository.updateLastLogin(
      user.id,
    );

    const accessToken =
      signAccessToken(user);

    const refreshToken =
      signRefreshToken(user);

    return {
      user,
      accessToken,
      refreshToken,
    };
  },

  async refresh(
    refreshToken: string,
  ) {
    let payload: JwtPayload;

    try {
      payload =
        jwt.verify(
          refreshToken,
          config.jwt.refreshSecret,
          {
            algorithms: ['HS256'],
          },
        ) as JwtPayload;
    } catch {
      throw AppError.unauthorized(
        'Invalid or expired refresh token',
        'REFRESH_INVALID',
      );
    }

    const user =
      await userRepository.findById(
        payload.sub,
      );

    if (!user) {
      throw AppError.unauthorized(
        'User not found',
        'USER_NOT_FOUND',
      );
    }

    if (
      payload.tokenVersion !==
      user.tokenVersion
    ) {
      throw AppError.unauthorized(
        'Session has been revoked',
        'REFRESH_REVOKED',
      );
    }

    const accessToken =
      signAccessToken(user);

    const newRefreshToken =
      signRefreshToken(user);

    return {
      user,
      accessToken,
      refreshToken:
        newRefreshToken,
    };
  },

  async logout(
    userId: string,
  ): Promise<void> {
    await userRepository.bumpTokenVersion(
      userId,
    );
  },

  async requestPasswordReset(
    email: string,
  ) {
    const user =
      await userRepository.findByEmail(
        email,
      );

    if (!user) {
      return null;
    }

    const rawToken =
      generateRandomToken(32);

    const tokenHash =
      hashToken(rawToken);

    const expires =
      new Date(
        Date.now() +
          60 * 60 * 1000,
      );

    await userRepository.setResetToken(
      user.id,
      tokenHash,
      expires,
    );

    /*
     * The raw token is returned only to the
     * email service/controller so it can be
     * placed in the reset link.
     */
    return {
      user,
      token: rawToken,
    };
  },

  async resetPassword(
    token: string,
    newPassword: string,
  ) {
    const tokenHash =
      hashToken(token);

    const user =
      await userRepository.findByResetToken(
        tokenHash,
      );

    if (!user) {
      throw AppError.badRequest(
        'Invalid or expired reset token',
        'RESET_TOKEN_INVALID',
      );
    }

    const passwordHash =
      await hashPassword(
        newPassword,
      );

    await userRepository.update(
      user.id,
      {
        passwordHash,
      },
    );

    await userRepository.clearResetToken(
      user.id,
    );

    await userRepository.bumpTokenVersion(
      user.id,
    );

    return user;
  },
};