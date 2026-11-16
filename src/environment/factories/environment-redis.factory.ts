import { registerAs } from '@nestjs/config';
import type { RedisConfigType } from '../../libs/redis/redis-config.type';
import { get } from '../utils/env-var';

export const environmentRedisFactory = registerAs(
  'redis',
  (): RedisConfigType => ({
    redis: {
      url: get('REDIS_URL').default('redis://localhost:6379').asString()!,
    },
  }),
);
