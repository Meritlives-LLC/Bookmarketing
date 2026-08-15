/**
 * Scrape result cache — **in-memory primary**, Redis optional fallback.
 *
 * - Reads always check process memory first (fast, no network).
 * - On memory miss, try Redis if it is enabled and ready.
 * - Writes always update memory; Redis is best-effort so other workers
 *   can warm from a previous successful scrape when this process restarts.
 *
 * Redis never blocks or fails the audit path.
 */
import { redis } from '../config/redis';
import { config } from '../config';
import { logger } from '../utils/logger';

const MEMORY = new Map<string, { expiresAt: number; value: string }>();
const DEFAULT_TTL_SEC = 60 * 60 * 6; // 6 hours
const REDIS_TIMEOUT_MS = 300;

function memoryGet(key: string): string | null {
  const hit = MEMORY.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    MEMORY.delete(key);
    return null;
  }
  return hit.value;
}

function memorySet(key: string, value: string, ttlSec: number): void {
  MEMORY.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  if (MEMORY.size > 500) {
    const first = MEMORY.keys().next().value;
    if (first) MEMORY.delete(first);
  }
}

async function redisGet(key: string): Promise<string | null> {
  if (!config.redis.enabled || redis.status !== 'ready') return null;
  try {
    return await Promise.race([
      redis.get(key),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('redis get timeout')), REDIS_TIMEOUT_MS)
      ),
    ]);
  } catch {
    return null;
  }
}

async function redisSetBestEffort(key: string, value: string, ttlSec: number): Promise<void> {
  if (!config.redis.enabled || redis.status !== 'ready') return;
  try {
    await Promise.race([
      redis.set(key, value, 'EX', ttlSec),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('redis set timeout')), REDIS_TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    logger.warn('Redis scrape cache write skipped', { error: (error as Error).message });
  }
}

export const scrapeCache = {
  key(source: string, identity: string): string {
    const normalized = identity.trim().toLowerCase().slice(0, 200);
    return `scrape:v1:${source}:${normalized}`;
  },

  async get<T>(source: string, identity: string): Promise<T | null> {
    const k = this.key(source, identity);

    const local = memoryGet(k);
    if (local) {
      try {
        return JSON.parse(local) as T;
      } catch {
        MEMORY.delete(k);
      }
    }

    const remote = await redisGet(k);
    if (!remote) return null;

    memorySet(k, remote, DEFAULT_TTL_SEC);
    try {
      return JSON.parse(remote) as T;
    } catch {
      return null;
    }
  },

  async set<T>(source: string, identity: string, value: T, ttlSec = DEFAULT_TTL_SEC): Promise<void> {
    if (!value || (typeof value === 'object' && (value as { error?: boolean }).error === true)) {
      return;
    }
    const k = this.key(source, identity);
    const raw = JSON.stringify(value);
    memorySet(k, raw, ttlSec);
    await redisSetBestEffort(k, raw, ttlSec);
  },
};

const localBuckets = new Map<string, { count: number; resetAt: number }>();

export async function acquireRateSlot(
  bucket: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `ratelimit:scrape:${bucket}`;
  const now = Date.now();

  let entry = localBuckets.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowSec * 1000 };
    localBuckets.set(key, entry);
  }
  entry.count += 1;
  const localAllowed = entry.count <= limit;
  const localRemaining = Math.max(0, limit - entry.count);

  if (config.redis.enabled && redis.status === 'ready') {
    try {
      const multi = redis.multi();
      multi.incr(key);
      multi.ttl(key);
      const results = await Promise.race([
        multi.exec(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), REDIS_TIMEOUT_MS)),
      ]);
      if (results) {
        const count = Number(results[0]?.[1] ?? 1);
        const ttl = Number(results[1]?.[1] ?? -1);
        if (ttl < 0) {
          void redis.expire(key, windowSec).catch(() => undefined);
        }
        const redisAllowed = count <= limit;
        return {
          allowed: localAllowed && redisAllowed,
          remaining: Math.min(localRemaining, Math.max(0, limit - count)),
        };
      }
    } catch {
      // stay on local decision
    }
  }

  return { allowed: localAllowed, remaining: localRemaining };
}