import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { AppError } from '../utils/helpers';
import { logger } from '../utils/logger';
import { config } from '../config';

const MULTER_ERROR_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'Uploaded file exceeds the allowed size limit.',
  LIMIT_FILE_COUNT: 'Too many files in this upload.',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field in this upload.',
};

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = 'Internal server error';
  let code: string | undefined;
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = 'A record with this value already exists';
      code = 'DUPLICATE_ENTRY';
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Record not found';
      code = 'NOT_FOUND';
    } else {
      statusCode = 400;
      message = 'Database request error';
      code = err.code;
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    // Thrown when a request reaches Prisma with a value it rejects (e.g. an
    // invalid enum) that upstream Zod validation didn't already catch.
    // Belt-and-suspenders: routes should validate first, but this keeps any
    // gap from surfacing as a raw 500 with an internal Prisma stack trace.
    statusCode = 400;
    message = 'Invalid request data';
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  } else if (err instanceof MulterError) {
    // Multer's own middleware calls next(err) directly on a bad upload
    // (oversized file, wrong field name, too many files) — without this
    // branch that surfaced as a generic 500 instead of a client-fixable 400.
    statusCode = 400;
    message = MULTER_ERROR_MESSAGES[err.code] ?? 'File upload error';
    code = err.code;
  }

  if (statusCode >= 500) {
    logger.error(err.message, { stack: err.stack, path: req.originalUrl, method: req.method });
  } else {
    logger.warn(err.message, { path: req.originalUrl, method: req.method, statusCode });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      details,
      ...(config.isProduction ? {} : { stack: err.stack }),
    },
  });
}
