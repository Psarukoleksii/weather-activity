import { registerAs } from '@nestjs/config';
import type { PlacesConfigType } from '../../modules/places/places-config.type';
import { get } from '../utils/env-var';

export const environmentPlacesFactory = registerAs(
  'places',
  (): PlacesConfigType => ({
    places: {
      notFoundCacheTtlSeconds: get('GEOCODE_NOT_FOUND_TTL_SECONDS').default('3600').asIntPositive()!,
    },
  }),
);
