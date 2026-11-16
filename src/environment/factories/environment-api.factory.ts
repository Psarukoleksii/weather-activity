import type { ApiConfigType } from '../types/env-configs/api-config.type';
import { environmentBasicFactory } from './environment-basic.factory';
import { environmentOpenMeteoFactory } from './environment-open-meteo.factory';
import { environmentPgFactory } from './environment-pg.factory';
import { environmentRedisFactory } from './environment-redis.factory';
import { environmentRefreshFactory } from './environment-refresh.factory';
import { environmentScoringFactory } from './environment-scoring.factory';
import { environmentThrottleFactory } from './environment-throttle.factory';

const factories = [
  environmentBasicFactory,
  environmentPgFactory,
  environmentRedisFactory,
  environmentThrottleFactory,
  environmentOpenMeteoFactory,
  environmentScoringFactory,
  environmentRefreshFactory,
] as const;

export const environmentApiFactory = (): ApiConfigType =>
  Object.assign({}, ...factories.map((factory) => factory()));
