import type { ActivityScoreRow } from '../../models/activity-score.entity';
import type { Place } from '../../models/place.entity';
import type { HourWeather } from '../../models/weather-hourly.entity';
import { daysBetween, groupByLocalDate, todayIn } from '../../utils/local-date';
import type { ActivityScoringService } from '../scoring/activity-scoring.service';
import { DayWeatherContext } from '../scoring/day-weather.context';
import { ALGO_VERSION } from '../scoring/scoring.config';

type PlaceForScoring = Pick<Place, 'id' | 'timezone' | 'elevationM' | 'hasMarineData'>;

/**
 * Pure: hourly weather of a place → score rows for every local day from today on
 * (8 days after a refresh, so 7 remain after midnight). No I/O.
 */
export function scoreDays(
  scoring: ActivityScoringService,
  place: PlaceForScoring,
  hours: readonly HourWeather[],
  now: Date,
): ActivityScoreRow[] {
  const today = todayIn(place.timezone, now);
  const result: ActivityScoreRow[] = [];
  for (const [localDate, group] of groupByLocalDate(hours, (h) => h.validAt, place.timezone)) {
    const daysAhead = daysBetween(today, localDate);
    if (daysAhead < 0) continue;
    const ctx = new DayWeatherContext({
      localDate,
      daysAhead,
      elevationM: place.elevationM,
      hasMarineData: place.hasMarineData,
      hours: group.map(({ item, localHour }) => ({ ...item, localHour })),
    });
    for (const s of scoring.calculate(ctx)) {
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
