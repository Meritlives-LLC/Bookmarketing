export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'AUTHOR' | 'ADMIN' | 'SUPER_ADMIN';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      apiKeyId?: string;
    }
  }
}
