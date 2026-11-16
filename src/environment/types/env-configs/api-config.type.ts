import type { DbConfigType } from '../../../libs/typeorm';
import type { RefreshConfigType } from '../../../modules/forecast-refresh/refresh-config.type';
import type { ScoringConfigType } from '../../../modules/scoring/scoring-config.type';
import type { OpenMeteoConfigType } from '../../../modules/weather/open-meteo-config.type';
import type { BasicConfigType } from '../basic-config.type';
import type { RedisConfigType } from '../redis-config.type';
import type { ThrottleConfigType } from '../throttle-config.type';

export interface ApiConfigType
  extends Readonly<BasicConfigType>,
    Readonly<DbConfigType>,
    Readonly<RedisConfigType>,
    Readonly<ThrottleConfigType>,
    Readonly<OpenMeteoConfigType>,
    Readonly<ScoringConfigType>,
    Readonly<RefreshConfigType> {}
