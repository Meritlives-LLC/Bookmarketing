import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  connectTimeout: 10_000,
  retryStrategy(times) {
    // Backs off up to 10s between attempts; keeps trying indefinitely so the
    // service self-heals once REDIS_URL points at a reachable instance.
    return Math.min(times * 500, 10_000);
  },
});

redis.on('error', (error) => {
  // Avoid log spam when Redis was never configured (e.g. Render without REDIS_URL)
  if (config.redis.enabled) {
    logger.error('Redis connection error', { error: error.message });
  }
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

export async function connectRedis(): Promise<void> {
  if (!config.redis.enabled) {
    logger.info(
      'REDIS_URL not set — skipping Redis. Rate limiting uses in-memory fallback; job queues inactive.'
    );
    return;
  }

  // redis.connect() can retry indefinitely (retryStrategy never gives up).
  // Race against a short timeout so bootstrap never blocks on a bad URL.
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 8_000);
  });
  await Promise.race([redis.connect().catch(() => undefined), timeout]);
}

export async function disconnectRedis(): Promise<void> {
  try {
    redis.disconnect();
  } catch {
    // ignore
  }
}