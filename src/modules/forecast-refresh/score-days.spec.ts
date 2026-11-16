import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ActivityType } from '../../models/enums';
import { ActivityScoringService } from '../scoring/activity-scoring.service';
import { ALGO_VERSION } from '../scoring/scoring.config';
import { parseForecast, parseMarine } from '../weather/open-meteo.client';
import { scoreDays } from './score-days';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, '../../../test/fixtures', name), 'utf8'));

describe('scoreDays', () => {
  const scoring = new ActivityScoringService({ skiMinElevationM: 300 });
  const forecast = parseForecast(fixture('forecast-biarritz.json'));
  const marine = parseMarine(fixture('marine-biarritz.json'));
  const hours = forecast.map((f, i) => ({ ...f, ...marine[i], validAt: f.validAt }));
  const place = { id: '7', timezone: 'Europe/Paris', elevationM: 39, hasMarineData: true };
  const firstDay = new Date(hours[12].validAt); // midday of the first local day

  it('scores all 8 local days × 4 activities with the current ALGO_VERSION', () => {
    const rows = scoreDays(scoring, place, hours, firstDay);
    expect(rows).toHaveLength(32);
    expect(new Set(rows.map((r) => r.localDate)).size).toBe(8);
    expect(rows.every((r) => r.placeId === '7' && r.algoVersion === ALGO_VERSION && r.computedAt === firstDay)).toBe(true);
    const surfing = rows.filter((r) => r.activity === ActivityType.SURFING);
    expect(surfing.every((r) => r.applicable && r.score !== null)).toBe(true);
  });

  it('skips days that are already in the past', () => {
    const nextDay = new Date(firstDay.getTime() + 24 * 3_600_000);
    const rows = scoreDays(scoring, place, hours, nextDay);
    expect(new Set(rows.map((r) => r.localDate)).size).toBe(7);
  });

  it('is deterministic: the same weather gives the same scores', () => {
    const a = scoreDays(scoring, place, hours, firstDay);
    const b = scoreDays(scoring, place, [...hours].reverse(), firstDay);
    const key = (r: { activity: string; localDate: string }) => `${r.activity}:${r.localDate}`;
    expect(new Map(b.map((r) => [key(r), r.score]))).toEqual(new Map(a.map((r) => [key(r), r.score])));
  });
});
