import type { DbConfigType } from '../../../libs/typeorm';
import type { RefreshConfigType, RefreshPollerConfigType } from '../../../modules/forecast-refresh/refresh-config.type';
import type { ScoringConfigType } from '../../../modules/scoring/scoring-config.type';
import type { OpenMeteoConfigType } from '../../../modules/weather/open-meteo-config.type';

/** No HTTP, GraphQL or Redis settings: the worker only refreshes places. */
export interface WorkerConfigType
  extends Readonly<DbConfigType>,
    Readonly<OpenMeteoConfigType>,
    Readonly<ScoringConfigType>,
    Readonly<RefreshConfigType>,
    Readonly<RefreshPollerConfigType> {}
