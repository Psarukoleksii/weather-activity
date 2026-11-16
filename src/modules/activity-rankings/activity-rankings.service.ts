import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLError } from 'graphql';
import { Between } from 'typeorm';
import { ActivityScore } from '../../models/activity-score.entity';
import { Place } from '../../models/place.entity';
import { addDays, todayIn } from '../../utils/local-date';
import { ForecastRefreshService } from '../forecast-refresh/forecast-refresh.service';
import type { RefreshConfigType } from '../forecast-refresh/refresh-config.type';
import { PlacesService } from '../places/places.service';
import { UpstreamUnavailableError } from '../weather/open-meteo.client';
import { ActivityRankingsResultDto } from './dto/activity-rankings.types';
import { rankDays } from './rank-days';

export const RANKING_DAYS = 7;
const COUNTRY_RE = /^[A-Za-z]{2}$/;
/** Longest real place names are well under this; longer input never reaches the geocoder. */
export const MAX_CITY_LENGTH = 70;

/**
 * Request flow (plan, section 5): validate → find or geocode the place → bump last_requested_at →
 * synchronous refresh if the data is missing or older than SYNC_REFRESH_AFTER_HOURS → read 7 days → rank.
 *
 * No response cache on purpose: the query is an index lookup plus ~28 score rows.
 * If read load grows, the finished response can be cached in the Redis we already run
 * (key `rankings:{country}:{name_normalized}`, TTL a few minutes).
 */
@Injectable()
export class ActivityRankingsService {
  private readonly logger = new Logger(ActivityRankingsService.name);

  constructor(
    private readonly places: PlacesService,
    private readonly refresh: ForecastRefreshService,
    private readonly config: ConfigService<RefreshConfigType, true>,
  ) {}

  async getRankings(cityArg: string, countryArg: string): Promise<ActivityRankingsResultDto> {
    const city = (cityArg ?? '').trim();
    const country = (countryArg ?? '').trim().toUpperCase();
    if (!city) throw badInput('city must not be empty');
    if (city.length > MAX_CITY_LENGTH) throw badInput(`city must be at most ${MAX_CITY_LENGTH} characters`);
    if (!COUNTRY_RE.test(country)) throw badInput('country must be a two-letter ISO 3166-1 alpha-2 code');

    let place = await this.places.findByName(city, country);
    if (place) {
      await this.places.touchRequested(place.id);
    } else {
      place = await this.upstream(() => this.places.createFromGeocoder(city, country));
      if (!place) {
        throw new GraphQLError(`City "${city}" not found in ${country}`, { extensions: { code: 'NOT_FOUND' } });
      }
      await this.places.touchRequested(place.id); // existing row reached through another spelling
    }

    if (this.needsSyncRefresh(place)) {
      const current = place;
      this.logger.log(`Synchronous refresh of place ${current.id} (${current.name})`);
      await this.upstream(() => this.refresh.refreshPlace(current.id, { observedLastFetchedAt: current.lastFetchedAt }));
      place = (await this.places.findById(current.id)) ?? current;
    }
    if (!place.lastFetchedAt) {
      throw new GraphQLError('Weather data is not available yet', { extensions: { code: 'UPSTREAM_UNAVAILABLE' } });
    }

    const today = todayIn(place.timezone);
    const rows = await ActivityScore.find({
      where: { placeId: place.id, localDate: Between(today, addDays(today, RANKING_DAYS - 1)) },
    });

    return {
      place: { id: place.id, name: place.name, country: place.countryCode, timezone: place.timezone },
      dataAsOf: place.lastFetchedAt,
      activities: rankDays(rows),
    };
  }

  private needsSyncRefresh(place: Place): boolean {
    if (!place.lastFetchedAt) return true;
    const maxAgeMs = this.config.getOrThrow('refresh.syncRefreshAfterHours', { infer: true }) * 3_600_000;
    return Date.now() - place.lastFetchedAt.getTime() > maxAgeMs;
  }

  private async upstream<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof UpstreamUnavailableError) {
        const cause = err.cause instanceof Error ? `: ${err.cause.name} ${err.cause.message}` : '';
        this.logger.warn(`${err.message}${cause}`);
        throw new GraphQLError('Weather provider is unavailable, try again later', {
          extensions: { code: 'UPSTREAM_UNAVAILABLE' },
        });
      }
      throw err;
    }
  }
}

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}
