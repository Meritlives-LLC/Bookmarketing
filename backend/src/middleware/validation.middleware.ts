import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../utils/helpers';

type Source = 'body' | 'query' | 'params';

export function validate(schema: AnyZodObject, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      (req as Record<Source, unknown>)[source] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return next(AppError.badRequest('Validation failed', 'VALIDATION_ERROR').withDetails(details));
      }
      next(error);
    }
  };
}
