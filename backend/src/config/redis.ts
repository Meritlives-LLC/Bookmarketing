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
  logger.error('Redis connection error', { error: error.message });
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

export async function connectRedis(): Promise<void> {
  // redis.connect() will hang indefinitely if REDIS_URL is wrong, because
  // retryStrategy never gives up (by design, for self-healing). That's fine
  // for the long-lived background client, but bootstrap() must not block
  // server startup on it — so race it against a timeout here. The retry
  // loop keeps running in the background regardless, and 'connect' will
  // still fire later once REDIS_URL points at a reachable instance.
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 8_000);
  });
  await Promise.race([redis.connect().catch(() => undefined), timeout]);
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
}