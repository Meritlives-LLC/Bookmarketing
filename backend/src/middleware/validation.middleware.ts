import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/helpers';

type RequestSource = 'body' | 'query' | 'params';

/**
 * Zod request validator.
 * Usage:
 *   validate(schema)              → validates req.body
 *   validate(schema, 'query')     → validates req.query
 *   validate(schema, 'params')    → validates req.params
 *
 * On success, replaces the source with the parsed (coerced/stripped) value.
 */
export function validate(schema: ZodSchema, source: RequestSource = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      // Assign back so controllers see coerced values (e.g. page/limit as numbers)
      (req as Request & Record<RequestSource, unknown>)[source] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        next(
          AppError.badRequest('Validation failed', 'VALIDATION_ERROR').withDetails(details)
        );
        return;
      }
      next(error);
    }
  };
}