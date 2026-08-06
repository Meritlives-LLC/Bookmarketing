import { QueueOptions } from 'bullmq';
import { config } from '../config';

function parseRedisUrl(): { host: string; port: number; password?: string } | null {
  if (!config.redis.enabled) {
    return null;
  }
  const raw = config.redis.url;
  if (!raw || raw.trim() === '') {
    return null;
  }
  try {
    const url = new URL(raw);
    // Reject incomplete Render hostnames (e.g. "red-xxxxx" without domain)
    const host = url.hostname || '';
    if (!host || (!host.includes('.') && host !== 'localhost' && host !== '127.0.0.1')) {
      return null;
    }
    return {
      host,
      port: Number(url.port || 6379),
      password: url.password || undefined,
    };
  } catch {
    return null;
  }
}

const parsed = parseRedisUrl();

/**
 * BullMQ connection. Only points at a real Redis when REDIS_URL is valid.
 * Otherwise uses a dummy local address so importing Queue modules
 * does not spam connection errors.
 */
export const bullConnection: Pick<QueueOptions, 'connection'> = {
  connection: parsed
    ? { ...parsed, maxRetriesPerRequest: null }
    : {
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        lazyConnect: true,
      },
};

export const isRedisConfigured = Boolean(parsed);