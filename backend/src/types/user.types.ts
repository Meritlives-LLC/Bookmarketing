export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  // Only present on refresh tokens — see the tokenVersion doc comment on
  // User in schema.prisma. Access tokens don't carry it.
  tokenVersion?: number;
}
