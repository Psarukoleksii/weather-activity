import { registerAs } from '@nestjs/config';
import type { RedisConfigType } from '../types/redis-config.type';
import { get } from '../utils/env-var';

export const environmentRedisFactory = registerAs(
  'redis',
  (): RedisConfigType => ({
    redis: {
      url: get('REDIS_URL').default('redis://localhost:6379').asString()!,
    },
  }),
);
