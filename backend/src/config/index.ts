import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  port: parseInt(process.env.PORT ?? '4000', 10),
  apiPrefix: '/api/v1',

  timezone: process.env.TZ ?? 'Africa/Lagos',

  database: {
    url: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/bookmarketingos'),
  },

  redis: {
    url: (() => {
      const url = process.env.REDIS_URL;
      if (!url && process.env.NODE_ENV === 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          'WARNING: REDIS_URL is not set in production — falling back to redis://localhost:6379, ' +
            'which will not exist on most hosts. Rate limiting and job queues will fail until this is set.'
        );
      }
      return url ?? 'redis://localhost:6379';
    })(),
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  },

  aws: {
    region: process.env.AWS_REGION ?? 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    s3Bucket: process.env.AWS_S3_BUCKET ?? 'bookmarketingos-uploads',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    prices: {
      starter: process.env.STRIPE_PRICE_STARTER ?? '',
      pro: process.env.STRIPE_PRICE_PRO ?? '',
      agency: process.env.STRIPE_PRICE_AGENCY ?? '',
    },
  },

  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    defaultModel: process.env.AI_DEFAULT_MODEL ?? 'gpt-4o-mini',
  },

  email: {
    host: process.env.SMTP_HOST ?? 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT ?? '2525', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.EMAIL_FROM ?? 'BookMarketingOS <noreply@bookmarketingos.com>',
  },

  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',

  logLevel: process.env.LOG_LEVEL ?? 'info',
};

export type Config = typeof config;