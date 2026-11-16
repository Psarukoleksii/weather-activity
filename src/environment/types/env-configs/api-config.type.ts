import type { RedisConfigType } from '../../../libs/redis/redis-config.type';
import type { DbConfigType } from '../../../libs/typeorm';
import type { PlacesConfigType } from '../../../modules/places/places-config.type';
import type { RefreshConfigType } from '../../../modules/forecast-refresh/refresh-config.type';
import type { ScoringConfigType } from '../../../modules/scoring/scoring-config.type';
import type { OpenMeteoConfigType } from '../../../modules/weather/open-meteo-config.type';
import type { BasicConfigType } from '../basic-config.type';
import type { ThrottleConfigType } from '../../../libs/throttler/throttle-config.type';

export interface ApiConfigType
  extends Readonly<BasicConfigType>,
    Readonly<DbConfigType>,
    Readonly<RedisConfigType>,
    Readonly<ThrottleConfigType>,
    Readonly<OpenMeteoConfigType>,
    Readonly<ScoringConfigType>,
    Readonly<RefreshConfigType>,
    Readonly<PlacesConfigType> {}
