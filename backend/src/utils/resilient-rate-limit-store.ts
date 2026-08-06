import { MemoryStore } from 'express-rate-limit';
import type { Store, IncrementResponse, Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis';
import { config } from '../config';
import { logger } from './logger';

const REDIS_CALL_TIMEOUT_MS = 250;

/**
 * Rate-limit store that never touches Redis at module load time.
 *
 * - REDIS_URL unset / invalid → pure in-memory (no Redis client calls)
 * - Redis not ready yet → memory
 * - Redis ready → RedisStore (created lazily on first use)
 * - Redis slow/error → fall back to memory for that request
 *
 * Avoids crash:
 *   "Stream isn't writeable and enableOfflineQueue options is false"
 * when RedisStore constructor ran sendCommand before connect.
 */
export class ResilientRateLimitStore implements Store {
  private redisStore: RedisStore | null = null;
  private memoryStore: MemoryStore;
  private prefix: string;
  private options: Options | undefined;
  private warnedOnce = false;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.memoryStore = new MemoryStore();
  }

  init(options: Options): void {
    this.options = options;
    this.memoryStore.init?.(options);
    this.redisStore?.init?.(options);
  }

  private getRedisStore(): RedisStore | null {
    if (!config.redis.enabled) {
      return null;
    }
    if (redis.status !== 'ready') {
      return null;
    }
    if (!this.redisStore) {
      try {
        this.redisStore = new RedisStore({
          // @ts-expect-error - ioredis command signature is compatible at runtime
          sendCommand: (...args: string[]) => redis.call(...args),
          prefix: this.prefix,
        });
        if (this.options) {
          this.redisStore.init?.(this.options);
        }
      } catch (error) {
        if (!this.warnedOnce) {
          this.warnedOnce = true;
          logger.warn('Could not init Redis rate-limit store — using in-memory', {
            error: (error as Error).message,
          });
        }
        return null;
      }
    }
    return this.redisStore;
  }

  private async withFallback<T>(
    redisCall: (store: RedisStore) => Promise<T> | T,
    memoryCall: () => Promise<T> | T
  ): Promise<T> {
    const store = this.getRedisStore();
    if (!store) {
      return memoryCall();
    }
    try {
      return await Promise.race([
        Promise.resolve(redisCall(store)),
        new Promise<T>((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis rate-limit call timed out')),
            REDIS_CALL_TIMEOUT_MS
          )
        ),
      ]);
    } catch (error) {
      if (!this.warnedOnce) {
        this.warnedOnce = true;
        logger.warn('Rate limit falling back to in-memory (Redis unavailable/slow)', {
          error: (error as Error).message,
        });
      }
      return memoryCall();
    }
  }

  increment(key: string): Promise<IncrementResponse> {
    return this.withFallback(
      (store) => store.increment(key),
      () => this.memoryStore.increment(key)
    );
  }

  decrement(key: string): Promise<void> {
    return this.withFallback(
      (store) => store.decrement(key),
      () => this.memoryStore.decrement(key)
    );
  }

  resetKey(key: string): Promise<void> {
    return this.withFallback(
      (store) => store.resetKey(key),
      () => this.memoryStore.resetKey(key)
    );
  }
}