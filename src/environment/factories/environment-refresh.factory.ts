import { registerAs } from '@nestjs/config';
import type { RefreshConfigType } from '../../modules/forecast-refresh/refresh-config.type';
import { get } from '../utils/env-var';

export const environmentRefreshFactory = registerAs(
  'refresh',
  (): RefreshConfigType => ({
    refresh: {
      syncRefreshAfterHours: get('SYNC_REFRESH_AFTER_HOURS').default('24').asIntPositive()!,
      hotRefreshHours: get('HOT_REFRESH_HOURS').default('3').asIntPositive()!,
      warmRefreshHours: get('WARM_REFRESH_HOURS').default('12').asIntPositive()!,
    },
  }),
);
