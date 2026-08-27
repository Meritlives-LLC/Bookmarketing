import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Reads a required environment variable.
 * `fallback` is ONLY ever used outside production (local dev / test convenience).
 * In production, a missing value always throws — insecure defaults must never
 * silently ship (e.g. JWT signing secrets).
 */
function required(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (!isProduction && fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${name}`);
}

/**
 * Same as `required`, but additionally rejects known placeholder/example
 * values in production so a copy-pasted .env.example can't be deployed as-is.
 */
function requiredSecret(name: string, insecureValues: string[], fallback?: string): string {
  const value = required(name, fallback);
  if (isProduction && insecureValues.includes(value)) {
    throw new Error(
      `Environment variable ${name} is set to a known insecure/placeholder value. ` +
        `Generate a strong secret (e.g. \`openssl rand -base64 48\`) and set it before starting in production.`
    );
  }
  return value;
}

/**
 * Parses CORS_ORIGIN into an allowlist. `*` is rejected outright in
 * production: corsMiddleware uses a custom origin callback (needed for
 * credentialed requests), which means a `*` entry doesn't send a literal
 * wildcard header — it reflects whatever Origin the request sent, back with
 * `Access-Control-Allow-Credentials: true`. That's an open CORS policy
 * letting any site make authenticated, cookie-credentialed requests against
 * this API. Same "never silently ship an insecure default" philosophy as
 * requiredSecret() above.
 */
function corsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  const origins = raw.split(',').map((o) => o.trim());
  if (isProduction && origins.includes('*')) {
    throw new Error(
      'CORS_ORIGIN is set to "*" in production. This allows any website to make ' +
        'authenticated, cookie-credentialed requests against this API. Set it to your ' +
        'exact frontend origin(s), comma-separated, instead.'
    );
  }
  return origins;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  port: parseInt(process.env.PORT ?? '4000', 10),
  // Defaults to all interfaces (correct for standalone/two-service
  // deployments — see backend/Dockerfile, docker-compose.yml). The
  // single-service Render deploy (root package.json's start:web) explicitly
  // sets this to 127.0.0.1: with both processes sharing one container,
  // loopback keeps the backend reachable to the frontend's proxy while
  // making it invisible outside the container.
  host: process.env.BIND_HOST ?? '0.0.0.0',
  apiPrefix: '/api/v1',

  timezone: process.env.TZ ?? 'Africa/Lagos',

  database: {
    url: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/bookmarketingos'),
  },

  redis: (() => {
    // Optional everywhere (including production / Render).
    // Disabled when: unset, invalid URL, incomplete host (red-xxxxx), or
    // localhost/127.0.0.1 while NODE_ENV=production (Render has no local Redis).
    const raw = (process.env.REDIS_URL || '').trim();
    const isProd = process.env.NODE_ENV === 'production';
    let enabled = false;
    let url = 'redis://127.0.0.1:6379';
    if (raw) {
      try {
        const parsed = new URL(raw);
        const host = (parsed.hostname || '').toLowerCase();
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        const hasDomain = host.includes('.');
        if (isLocal && !isProd) {
          enabled = true;
          url = raw;
        } else if (hasDomain && !isLocal) {
          enabled = true;
          url = raw;
        }
      } catch {
        // invalid URL → disabled
      }
    }
    return { url, enabled };
  })(),



  jwt: {
    accessSecret: requiredSecret(
      'JWT_ACCESS_SECRET',
      ['dev-access-secret-change-me', 'change-me-access-secret', 'change-me', 'secret'],
      'dev-access-secret-change-me'
    ),
    refreshSecret: requiredSecret(
      'JWT_REFRESH_SECRET',
      ['dev-refresh-secret-change-me', 'change-me-refresh-secret', 'change-me', 'secret'],
      'dev-refresh-secret-change-me'
    ),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  cors: {
    origin: corsOrigins(),
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

  cloudinary: (() => {
    const cloudName = (process.env.CLOUDINARY_CLOUD_NAME ?? '').trim();
    const apiKey = (process.env.CLOUDINARY_API_KEY ?? '').trim();
    const apiSecret = (process.env.CLOUDINARY_API_SECRET ?? '').trim();
    const folder = (process.env.CLOUDINARY_FOLDER ?? 'book-covers').trim() || 'book-covers';
    return {
      enabled: Boolean(cloudName && apiKey && apiSecret),
      cloudName,
      apiKey,
      apiSecret,
      folder,
    };
  })(),

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    prices: {
      starter: process.env.STRIPE_PRICE_STARTER ?? '',
      pro: process.env.STRIPE_PRICE_PRO ?? '',
      agency: process.env.STRIPE_PRICE_AGENCY ?? '',
    },
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

  ai: {
    groq: (() => {
      const apiKey = (process.env.GROQ_API_KEY ?? '').trim();
      return {
        // Groq's free-tier, OpenAI-compatible chat completions API.
        // https://console.groq.com — no card required for the free/dev tier.
        enabled: apiKey.length > 0,
        apiKey,
        baseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
        // openai/gpt-oss-120b is Groq's current recommended general-purpose
        // model (llama-3.3-70b-versatile was deprecated June 2026). Override
        // via GROQ_MODEL without a code change if Groq retires this one too.
        model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
        timeoutMs: parseInt(process.env.GROQ_TIMEOUT_MS ?? '20000', 10),
        maxRetries: parseInt(process.env.GROQ_MAX_RETRIES ?? '2', 10),
      };
    })(),
  },
};

export type Config = typeof config;