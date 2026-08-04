export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public details?: unknown;

  constructor(message: string, statusCode = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  withDetails(details: unknown): this {
    this.details = details;
    return this;
  }

  static badRequest(message: string, code?: string) {
    return new AppError(message, 400, code);
  }
  static unauthorized(message = 'Unauthorized', code?: string) {
    return new AppError(message, 401, code);
  }
  static forbidden(message = 'Forbidden', code?: string) {
    return new AppError(message, 403, code);
  }
  static notFound(message = 'Resource not found', code?: string) {
    return new AppError(message, 404, code);
  }
  static conflict(message: string, code?: string) {
    return new AppError(message, 409, code);
  }
  static tooManyRequests(message = 'Too many requests', code?: string) {
    return new AppError(message, 429, code);
  }
  static internal(message = 'Internal server error', code?: string) {
    return new AppError(message, 500, code);
  }
}

export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (...args: Parameters<T>) => {
    const [, , next] = args as unknown as [any, any, (err?: unknown) => void];
    return Promise.resolve(fn(...args)).catch(next);
  };
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const clone = { ...obj };
  for (const key of keys) delete clone[key];
  return clone;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
