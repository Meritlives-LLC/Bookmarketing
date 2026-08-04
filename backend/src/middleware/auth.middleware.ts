import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../utils/helpers';
import { JwtPayload } from '../types';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.accessToken;

    if (!token) {
      throw AppError.unauthorized('Authentication token missing');
    }

    const payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role as 'AUTHOR' | 'ADMIN' | 'SUPER_ADMIN',
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(AppError.unauthorized('Token expired', 'TOKEN_EXPIRED'));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(AppError.unauthorized('Invalid token', 'TOKEN_INVALID'));
    }
    next(error);
  }
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.accessToken;
    if (!token) return next();

    const payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role as 'AUTHOR' | 'ADMIN' | 'SUPER_ADMIN',
    };
    next();
  } catch {
    next();
  }
}

export function requireRole(...roles: Array<'AUTHOR' | 'ADMIN' | 'SUPER_ADMIN'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}
