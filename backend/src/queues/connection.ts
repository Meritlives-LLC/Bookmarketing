import { QueueOptions } from 'bullmq';
import { config } from '../config';

function parseRedisUrl() {
  const url = new URL(config.redis.url);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
  };
}

export const bullConnection: Pick<QueueOptions, 'connection'> = {
  connection: parseRedisUrl(),
};
