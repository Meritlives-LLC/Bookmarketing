import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

/**
 * When REDIS_URL is not set we never attempt a real connection.
 * When it is set but unreachable we retry a few times then stop permanently
 * so logs stay clean (no infinite ENOTFOUND spam on Render).
 */
const MAX_RETRIES = 3;

function createRedisClient(): Redis {
  if (!config.redis.enabled) {
    // Inert client: never connects, never retries, never queues commands.
    return new Redis({
      host: '127.0.0.1',
      port: 6379,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 1,
      retryStrategy: () => null, // stop immediately — no reconnects
    });
  }

  let gaveUp = false;

  const client = new Redis(config.redis.url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    retryStrategy(times) {
      if (times > MAX_RETRIES) {
        if (!gaveUp) {
          gaveUp = true;
          logger.warn(
            `Redis unreachable after ${MAX_RETRIES} attempts — giving up. ` +
              'API continues; rate limits use in-memory; queues inactive until REDIS_URL is fixed.'
          );
        }
        return null; // stop reconnecting
      }
      return Math.min(times * 500, 3_000);
    },
  });

  let errorLogged = false;
  client.on('error', (error) => {
    // One structured log only — no stack spam
    if (!errorLogged) {
      errorLogged = true;
      logger.warn('Redis connection error (will stop retrying soon)', {
        error: error.message,
      });
    }
  });

  client.on('connect', () => {
    errorLogged = false;
    gaveUp = false;
    logger.info('Redis connected successfully');
  });

  return client;
}

export const redis = createRedisClient();

export async function connectRedis(): Promise<void> {
  if (!config.redis.enabled) {
    // Silent skip — no log noise when Redis was never configured
    return;
  }

  try {
    await Promise.race([
      redis.connect().then(() => undefined).catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 6_000)),
    ]);
  } catch {
    // already handled by retryStrategy / error handler
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!config.redis.enabled) return;
  try {
    redis.disconnect();
  } catch {
    // ignore
  }
}