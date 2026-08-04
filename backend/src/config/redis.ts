import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
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
