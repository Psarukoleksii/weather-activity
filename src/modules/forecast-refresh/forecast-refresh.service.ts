import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ActivityScore, ActivityScoreRow } from '../../models/activity-score.entity';
import { Place } from '../../models/place.entity';
import { HourWeather, WeatherHourly } from '../../models/weather-hourly.entity';
import { daysBetween, groupByLocalDate, todayIn } from '../../utils/local-date';
import { ActivityScoringService } from '../scoring/activity-scoring.service';
import { DayWeatherContext } from '../scoring/day-weather.context';
import { ALGO_VERSION } from '../scoring/scoring.config';
import { WeatherService } from '../weather/weather.service';

export interface RefreshOptions {
  /**
   * `last_fetched_at` the caller saw when it decided to refresh. If it changed by the time
   * the lock is taken, another process has just refreshed the place and we exit without API calls.
   */
  observedLastFetchedAt: Date | null;
  /** Worker: skip the place if another process holds the lock instead of waiting. */
  skipIfLocked?: boolean;
}

export type RefreshOutcome = 'refreshed' | 'already-fresh' | 'locked';

@Injectable()
export class ForecastRefreshService {
  private readonly logger = new Logger(ForecastRefreshService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly weather: WeatherService,
    private readonly scoring: ActivityScoringService,
  ) {}

  /**
   * The only refresh path, used by the API (new or stale place) and by the worker:
   * fetch → upsert weather → drop past rows → score 8 days → upsert scores → last_fetched_at.
   */
  async refreshPlace(placeId: string, options: RefreshOptions): Promise<RefreshOutcome> {
    const started = Date.now();
    const outcome = await this.dataSource.transaction(async (em) => {
      if (!(await this.lock(em, placeId, options.skipIfLocked ?? false))) return 'locked' as const;

      const place = await em.findOneByOrFail(Place, { id: placeId });
      if ((place.lastFetchedAt?.getTime() ?? null) !== (options.observedLastFetchedAt?.getTime() ?? null)) {
        return 'already-fresh' as const;
      }

      const fetched = await this.weather.fetchHourly(place);
      const now = new Date();
      await this.weather.upsertHourly(em, place.id, fetched.hours, now);
      await this.deletePastRows(em, place);

      const scores = this.scoreDays(place, fetched.hours, fetched.hasMarineData, now);
      await this.upsertScores(em, scores);

      await em.update(Place, { id: place.id }, { lastFetchedAt: now, hasMarineData: fetched.hasMarineData });
      return 'refreshed' as const;
    });
    this.logger.log(`refreshPlace(${placeId}): ${outcome} in ${Date.now() - started} ms`);
    return outcome;
  }

  private async lock(em: EntityManager, placeId: string, skipIfLocked: boolean): Promise<boolean> {
    if (skipIfLocked) {
      const [row] = await em.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS locked', [placeId]);
      return row.locked === true;
    }
    await em.query('SELECT pg_advisory_xact_lock($1::bigint)', [placeId]);
    return true;
  }

  /** Upsert does not remove past hours; without this the tables grow by 24 rows per place per day. */
  private async deletePastRows(em: EntityManager, place: Place): Promise<void> {
    // Inside the refresh transaction, so through its EntityManager rather than Active Record statics.
    await em
      .createQueryBuilder()
      .delete()
      .from(WeatherHourly)
      .where('place_id = :placeId', { placeId: place.id })
      .andWhere("valid_at < (date_trunc('day', now() AT TIME ZONE :tz) AT TIME ZONE :tz)", { tz: place.timezone })
      .execute();
    await em
      .createQueryBuilder()
      .delete()
      .from(ActivityScore)
      .where('place_id = :placeId', { placeId: place.id })
      .andWhere('local_date < CAST(now() AT TIME ZONE :tz AS date)', { tz: place.timezone })
      .execute();
  }

  /** Scores for every local day present in the forecast (8 days), from today on. */
  private scoreDays(place: Place, hours: HourWeather[], hasMarineData: boolean | null, now: Date): ActivityScoreRow[] {
    const today = todayIn(place.timezone, now);
    const result: ActivityScoreRow[] = [];
    for (const [localDate, group] of groupByLocalDate(hours, (h) => h.validAt, place.timezone)) {
      const daysAhead = daysBetween(today, localDate);
      if (daysAhead < 0) continue;
      const ctx = new DayWeatherContext({
        localDate,
        daysAhead,
        elevationM: place.elevationM,
        hasMarineData,
        hours: group.map(({ item, localHour }) => ({ ...item, localHour })),
      });
      for (const s of this.scoring.calculate(ctx)) {
        result.push({
          placeId: place.id,
          activity: s.activity,
          localDate,
          applicable: s.applicable,
          score: s.score,
          rating: s.rating,
          confidence: s.confidence,
          reasons: s.reasons,
          components: s.components,
          algoVersion: ALGO_VERSION,
          computedAt: now,
        });
      }
    }
    return result;
  }

  private async upsertScores(em: EntityManager, scores: ActivityScoreRow[]): Promise<void> {
    if (scores.length === 0) return;
    await em
      .createQueryBuilder()
      .insert()
      .into(ActivityScore)
      .values(scores)
      .orUpdate(
        ['applicable', 'score', 'rating', 'confidence', 'reasons', 'components', 'algo_version', 'computed_at'],
        ['place_id', 'activity', 'local_date'],
      )
      .execute();
  }
}
