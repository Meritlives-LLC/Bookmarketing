import jwt from 'jsonwebtoken';
import { config } from '../config';
import { userRepository } from '../repositories/user.repository';
import { hashPassword, comparePassword, generateRandomToken } from '../utils/crypto';
import { AppError } from '../utils/helpers';
import { RegisterInput, LoginInput, JwtPayload } from '../types/user.types';
import { User } from '@prisma/client';

function signAccessToken(user: User): string {
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiresIn });
}

function signRefreshToken(user: User): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  };
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
}

export const authService = {
  async register(input: RegisterInput) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }

    const passwordHash = await hashPassword(input.password);
    const emailVerifyToken = generateRandomToken(16);

    const user = await userRepository.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      emailVerifyToken,
    });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    return { user, accessToken, refreshToken, emailVerifyToken };
  },

  async login(input: LoginInput) {
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const valid = await comparePassword(input.password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    await userRepository.updateLastLogin(user.id);

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    return { user, accessToken, refreshToken };
  },

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as JwtPayload;
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token', 'REFRESH_INVALID');
    }

    const user = await userRepository.findById(payload.sub);
    if (!user) {
      throw AppError.unauthorized('User not found', 'USER_NOT_FOUND');
    }

    if (payload.tokenVersion !== user.tokenVersion) {
      // Token was valid and unexpired, but has been revoked by a logout or
      // password reset that happened since it was issued.
      throw AppError.unauthorized('Session has been revoked', 'REFRESH_REVOKED');
    }

    const accessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    return { user, accessToken, refreshToken: newRefreshToken };
  },

  /** Invalidates every outstanding refresh token for this user. */
  async logout(userId: string): Promise<void> {
    await userRepository.bumpTokenVersion(userId);
  },

  async requestPasswordReset(email: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      return null;
    }
    const token = generateRandomToken(24);
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await userRepository.setResetToken(user.id, token, expires);
    return { user, token };
  },

  async resetPassword(token: string, newPassword: string) {
    const user = await userRepository.findByResetToken(token);
    if (!user) {
      throw AppError.badRequest('Invalid or expired reset token', 'RESET_TOKEN_INVALID');
    }
    const passwordHash = await hashPassword(newPassword);
    await userRepository.update(user.id, { passwordHash });
    await userRepository.clearResetToken(user.id);
    // A refresh token issued before the reset (e.g. stolen from localStorage
    // via XSS) must not survive it — bump tokenVersion to revoke all of them.
    await userRepository.bumpTokenVersion(user.id);
    return user;
  },
};
