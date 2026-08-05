import { MemoryStore } from 'express-rate-limit';
import type { Store, IncrementResponse, Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis';
import { logger } from './logger';

const REDIS_CALL_TIMEOUT_MS = 250;

/**
 * Wraps RedisStore with a fast-failing MemoryStore fallback.
 *
 * Without this, every request goes through the rate limiter's Redis call
 * (see rate-limit.middleware.ts), and ioredis queues commands indefinitely
 * while disconnected/reconnecting (enableOfflineQueue defaults to true, and
 * config/redis.ts's retryStrategy never gives up). That means a broken
 * REDIS_URL doesn't just disable rate limiting — it hangs EVERY request to
 * the API, including /api/health, since the rate limiter middleware runs
 * before all routes and never calls next().
 *
 * This store races each Redis call against a short timeout and falls back
 * to an in-memory counter for that request when Redis isn't ready or is too
 * slow. Rate limiting becomes best-effort (per-instance, not shared across
 * replicas) while Redis is down, instead of the whole API becoming
 * unreachable.
 */
export class ResilientRateLimitStore implements Store {
  private redisStore: RedisStore;
  private memoryStore: MemoryStore;
  private warnedOnce = false;

  constructor(prefix: string) {
    this.redisStore = new RedisStore({
      // @ts-expect-error - ioredis command signature is compatible at runtime
      sendCommand: (...args: string[]) => redis.call(...args),
      prefix,
    });
    this.memoryStore = new MemoryStore();
  }

  init(options: Options): void {
    this.redisStore.init?.(options);
    this.memoryStore.init?.(options);
  }

  private async withFallback<T>(
    redisCall: () => Promise<T> | T,
    memoryCall: () => Promise<T> | T
  ): Promise<T> {
    if (redis.status !== 'ready') {
      return memoryCall();
    }
    try {
      return await Promise.race([
        Promise.resolve(redisCall()),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Redis rate-limit call timed out')), REDIS_CALL_TIMEOUT_MS)
        ),
      ]);
    } catch (error) {
      if (!this.warnedOnce) {
        this.warnedOnce = true;
        logger.error('Rate limit store falling back to in-memory (Redis unavailable/slow)', {
          error: (error as Error).message,
        });
      }
      return memoryCall();
    }
  }

  increment(key: string): Promise<IncrementResponse> {
    return this.withFallback(
      () => this.redisStore.increment(key),
      () => this.memoryStore.increment(key)
    );
  }

  decrement(key: string): Promise<void> {
    return this.withFallback(
      () => this.redisStore.decrement(key),
      () => this.memoryStore.decrement(key)
    );
  }

  resetKey(key: string): Promise<void> {
    return this.withFallback(
      () => this.redisStore.resetKey(key),
      () => this.memoryStore.resetKey(key)
    );
  }
}