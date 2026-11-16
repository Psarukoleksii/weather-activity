import { registerAs } from '@nestjs/config';
import type { RefreshPollerConfigType } from '../../modules/forecast-refresh/refresh-config.type';
import { get } from '../utils/env-var';

export const environmentRefreshPollerFactory = registerAs(
  'refreshPoller',
  (): RefreshPollerConfigType => ({
    refreshPoller: {
      pollIntervalSeconds: get('WORKER_POLL_INTERVAL_SECONDS').default('60').asIntPositive()!,
      batchSize: get('WORKER_BATCH_SIZE').default('10').asIntPositive()!,
      retryAfterMinutes: get('WORKER_RETRY_AFTER_MINUTES').default('15').asIntPositive()!,
    },
  }),
);
