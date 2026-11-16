import type { WorkerConfigType } from '../types/env-configs/worker-config.type';
import { environmentOpenMeteoFactory } from './environment-open-meteo.factory';
import { environmentPgFactory } from './environment-pg.factory';
import { environmentRefreshFactory } from './environment-refresh.factory';
import { environmentRefreshPollerFactory } from './environment-refresh-poller.factory';
import { environmentScoringFactory } from './environment-scoring.factory';

const factories = [
  environmentPgFactory,
  environmentOpenMeteoFactory,
  environmentScoringFactory,
  environmentRefreshFactory,
  environmentRefreshPollerFactory,
] as const;

export const environmentWorkerFactory = (): WorkerConfigType =>
  Object.assign({}, ...factories.map((factory) => factory()));
