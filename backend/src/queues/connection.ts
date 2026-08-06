import { QueueOptions } from 'bullmq';
import { config } from '../config';

function parseRedisUrl(): { host: string; port: number; password?: string } | null {
  if (!config.redis.enabled) {
    return null;
  }
  try {
    const url = new URL(config.redis.url);
    const host = url.hostname || '';
    if (!host) return null;
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

export const isRedisConfigured = Boolean(parsed);

/**
 * Only defined when Redis is enabled. Callers must check isRedisConfigured
 * before creating Queue/Worker instances — never connect to 127.0.0.1 dummy.
 */
export const bullConnection: Pick<QueueOptions, 'connection'> | null = parsed
  ? {
      connection: {
        ...parsed,
        maxRetriesPerRequest: null,
      },
    }
  : null;