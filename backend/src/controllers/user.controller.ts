import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/user.service';
import { userRepository } from '../repositories/user.repository';
import { emailService } from '../services/email.service';
import { omit, AppError } from '../utils/helpers';
import { config } from '../config';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
) {
  res.cookie('accessToken', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    ...COOKIE_OPTIONS,
    path: '/api/v1/auth/refresh',
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  });

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/api/v1/auth/refresh',
  });
}

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        user,
        accessToken,
        refreshToken,
        emailVerifyToken,
      } = await authService.register(req.body);

      await emailService.sendVerificationEmail(
        user.email,
        emailVerifyToken
      );

      setAuthCookies(res, accessToken, refreshToken);

      res.status(201).json({
        success: true,
        data: {
          user: omit(user, [
            'passwordHash',
            'resetToken',
            'emailVerifyToken',
          ]),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        user,
        accessToken,
        refreshToken,
      } = await authService.login(req.body);

      setAuthCookies(res, accessToken, refreshToken);

      res.json({
        success: true,
        data: {
          user: omit(user, [
            'passwordHash',
            'resetToken',
            'emailVerifyToken',
          ]),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user) {
        await authService.logout(req.user.id);
      }

      clearAuthCookies(res);

      res.json({
        success: true,
        data: {
          message: 'Logged out',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies?.refreshToken;

      if (!token) {
        throw AppError.unauthorized(
          'Refresh token missing',
          'REFRESH_INVALID'
        );
      }

      const {
        accessToken,
        refreshToken,
      } = await authService.refresh(token);

      setAuthCookies(res, accessToken, refreshToken);

      res.json({
        success: true,
        data: {
          message: 'Session refreshed',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async forgotPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await authService.requestPasswordReset(
        req.body.email
      );

      if (result) {
        await emailService.sendPasswordResetEmail(
          result.user.email,
          result.token
        );
      }

      res.json({
        success: true,
        data: {
          message:
            'If an account exists, a reset link was sent.',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      await authService.resetPassword(
        req.body.token,
        req.body.password
      );

      clearAuthCookies(res);

      res.json({
        success: true,
        data: {
          message: 'Password reset successful',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async verifyEmail(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { token } = req.body;

      const user =
        await userRepository.findByEmailVerifyToken(token);

      if (!user) {
        throw AppError.badRequest(
          'Invalid or expired verification link',
          'VERIFY_TOKEN_INVALID'
        );
      }

      await userRepository.update(user.id, {
        emailVerified: true,
        emailVerifyToken: null,
      });

      res.json({
        success: true,
        data: {
          message: 'Email verified',
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export const userController = {
  async me(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user =
        await userRepository.findByIdWithSubscription(
          req.user!.id
        );

      if (!user) return next();

      res.json({
        success: true,
        data: omit(user, [
          'passwordHash',
          'resetToken',
          'emailVerifyToken',
        ]),
      });
    } catch (error) {
      next(error);
    }
  },

  async update(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user = await userRepository.update(
        req.user!.id,
        req.body
      );

      res.json({
        success: true,
        data: omit(user, [
          'passwordHash',
          'resetToken',
          'emailVerifyToken',
        ]),
      });
    } catch (error) {
      next(error);
    }
  },

  async credits(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user =
        await userRepository.findById(req.user!.id);

      res.json({
        success: true,
        data: {
          credits: user?.credits ?? 0,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async updatePreferences(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user =
        await userRepository.findById(req.user!.id);

      const current =
        (user?.emailPreferences as Record<string, boolean>) ??
        {};

      const merged = {
        ...current,
        ...req.body,
      };

      const updated =
        await userRepository.updatePreferences(
          req.user!.id,
          merged
        );

      res.json({
        success: true,
        data: {
          emailPreferences:
            updated.emailPreferences,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};