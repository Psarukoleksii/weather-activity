import { registerAs } from '@nestjs/config';
import type { ScoringConfigType } from '../../modules/scoring/scoring-config.type';
import { get } from '../utils/env-var';

export const environmentScoringFactory = registerAs(
  'scoring',
  (): ScoringConfigType => ({
    scoring: {
      skiMinElevationM: get('SKI_MIN_ELEVATION_M').default('300').asIntPositive()!,
    },
  }),
);
