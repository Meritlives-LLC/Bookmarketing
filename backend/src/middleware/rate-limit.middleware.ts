import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis';
import { config } from '../config';

function buildStore(prefix: string) {
  return new RedisStore({
    // @ts-expect-error - ioredis command signature is compatible at runtime
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix,
  });
}

export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('rl:general:'),
  message: { success: false, error: { message: 'Too many requests, please try again later.' } },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('rl:auth:'),
  message: { success: false, error: { message: 'Too many attempts, please try again later.' } },
});

export const aiGenerationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('rl:ai:'),
  message: { success: false, error: { message: 'Generation limit reached, try again later.' } },
});
