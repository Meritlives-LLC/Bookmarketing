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
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
}