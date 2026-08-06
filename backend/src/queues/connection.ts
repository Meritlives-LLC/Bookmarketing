import { config } from '../config';

export type BullConnection = {
  connection: {
    host: string;
    port: number;
    password?: string;
    maxRetriesPerRequest: null;
  };
};

function parseRedisUrl(): BullConnection['connection'] | null {
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
      maxRetriesPerRequest: null,
    };
  } catch {
    return null;
  }
}

const parsed = parseRedisUrl();

export const isRedisConfigured = parsed !== null;

/**
 * Non-null only when Redis is enabled. Prefer requireBullConnection() in workers.
 */
export const bullConnection: BullConnection | null = parsed
  ? { connection: parsed }
  : null;

/** Throws if Redis is not configured — use in worker entrypoints. */
export function requireBullConnection(): BullConnection {
  if (!bullConnection) {
    throw new Error(
      'REDIS_URL is not configured. Set a real Redis URL (e.g. Upstash) before starting workers.'
    );
  }
  return bullConnection;
}