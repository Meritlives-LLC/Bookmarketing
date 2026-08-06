import { QueueOptions } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';

function parseRedisUrl(): { host: string; port: number; password?: string } | null {
  const raw = config.redis.url;
  if (!raw || raw.trim() === '') {
    return null;
  }
  try {
    const url = new URL(raw);
    return {
      host: url.hostname || 'localhost',
      port: Number(url.port || 6379),
      password: url.password || undefined,
    };
  } catch (error) {
    logger.warn('Invalid REDIS_URL — job queues will not connect', {
      error: (error as Error).message,
    });
    return null;
  }
}

const parsed = parseRedisUrl();

/**
 * BullMQ connection. When Redis is unavailable/misconfigured we still export
 * a local default so modules can import without crashing; actual Queue/Worker
 * operations will fail or idle until Redis is reachable.
 */
export const bullConnection: Pick<QueueOptions, 'connection'> = {
  connection: parsed ?? {
    host: '127.0.0.1',
    port: 6379,
  },
};

export const isRedisConfigured = Boolean(parsed);