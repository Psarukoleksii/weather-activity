import { registerAs } from '@nestjs/config';
import type { OpenMeteoConfigType } from '../../modules/weather/open-meteo-config.type';
import { get } from '../utils/env-var';

export const environmentOpenMeteoFactory = registerAs(
  'openMeteo',
  (): OpenMeteoConfigType => ({
    openMeteo: {
      callTimeoutSeconds: get('OPENMETEO_CALL_TIMEOUT_SECONDS').default('4').asIntPositive()!,
    },
  }),
);
