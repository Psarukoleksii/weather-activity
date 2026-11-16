import { registerAs } from '@nestjs/config';
import type { ThrottleConfigType } from '../types/throttle-config.type';
import { get } from '../utils/env-var';

export const environmentThrottleFactory = registerAs(
  'throttle',
  (): ThrottleConfigType => ({
    throttle: {
      ttlSeconds: get('THROTTLE_TTL_SECONDS').default('60').asIntPositive()!,
      limit: get('THROTTLE_LIMIT').default('60').asIntPositive()!,
    },
  }),
);
