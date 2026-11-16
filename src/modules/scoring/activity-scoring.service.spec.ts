import { ActivityType, Confidence, Rating } from '../../models/enums';
import { ActivityScoreResult, ActivityScoringService } from './activity-scoring.service';
import { DayWeatherContext } from './day-weather.context';
import { makeContext } from './testing/day-builder';

const service = new ActivityScoringService({ skiMinElevationM: 300 });

const scoreOf = (ctx: DayWeatherContext, activity: ActivityType): ActivityScoreResult =>
  service.calculate(ctx).find((r) => r.activity === activity)!;

const MOUNTAIN = { elevationM: 1500 };
const COAST = { hasMarineData: true, elevationM: 10 };

const powderDay = {
  temperatureC: -6,
  apparentTemperatureC: -10,
  snowDepthM: 1.0,
  windSpeedKmh: 10,
  windGustsKmh: 25,
  visibilityM: 15000,
  cloudCoverPct: 30,
};

const goodSurf = {
  waveHeightM: 1.6,
  wavePeriodS: 11,
  swellWaveHeightM: 1.5,
  swellWavePeriodS: 12,
  seaSurfaceTemperatureC: 21,
  windSpeedKmh: 8,
  windGustsKmh: 18,
};

describe('ActivityScoringService', () => {
  it('returns all four activities in a fixed order', () => {
    expect(service.calculate(makeContext()).map((r) => r.activity)).toEqual([
      ActivityType.SKIING,
      ActivityType.SURFING,
      ActivityType.OUTDOOR_SIGHTSEEING,
      ActivityType.INDOOR_SIGHTSEEING,
    ]);
  });

  describe('skiing', () => {
    it('deep snow with fresh powder is excellent', () => {
      const ctx = makeContext((h) => ({ ...powderDay, snowfallCm: h < 12 ? 1 : 0 }), MOUNTAIN);
      const r = scoreOf(ctx, ActivityType.SKIING);
      expect(r.applicable).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(90);
      expect(r.rating).toBe(Rating.EXCELLENT);
      expect(r.reasons).toContain('Fresh snow 12 cm');
      expect(r.components.snowDepth).toEqual({ raw: 100, score: 1, weight: 0.3 });
    });

    it('frosty day without snow gets at most 10', () => {
      const r = scoreOf(makeContext({ ...powderDay, snowDepthM: 0, temperatureC: -8 }, MOUNTAIN), ActivityType.SKIING);
      expect(r.score).toBeLessThanOrEqual(10);
      expect(r.rating).toBe(Rating.AVOID);
      expect(r.reasons[0]).toBe('Not enough snow: 0 cm');
    });

    it('unknown snow depth is capped like no snow', () => {
      const r = scoreOf(makeContext({ ...powderDay, snowDepthM: null }, MOUNTAIN), ActivityType.SKIING);
      expect(r.score).toBeLessThanOrEqual(10);
      expect(r.reasons).toContain('Snow depth unknown');
    });

    it('thaw on thin snow is capped at 10', () => {
      const r = scoreOf(makeContext({ ...powderDay, snowDepthM: 0.15, temperatureC: 6 }, MOUNTAIN), ActivityType.SKIING);
      expect(r.score).toBeLessThanOrEqual(10);
    });

    it('thaw on a deep base is not capped by the thaw rule', () => {
      const r = scoreOf(makeContext({ ...powderDay, snowDepthM: 0.8, temperatureC: 4 }, MOUNTAIN), ActivityType.SKIING);
      expect(r.score).toBeGreaterThan(40);
      expect(r.reasons.some((x) => x.startsWith('Too warm'))).toBe(true);
    });

    it('snow that fell in the morning counts (max of the day)', () => {
      const ctx = makeContext((h) => ({ ...powderDay, snowDepthM: h < 5 ? 0.3 : 0.05 }), MOUNTAIN);
      expect(scoreOf(ctx, ActivityType.SKIING).score).toBeGreaterThan(10);
    });

    it('dangerous gusts cap at 15', () => {
      const r = scoreOf(makeContext({ ...powderDay, windGustsKmh: 85 }, MOUNTAIN), ActivityType.SKIING);
      expect(r.score).toBeLessThanOrEqual(15);
      expect(r.reasons).toContain('Dangerous gusts 85 km/h');
    });

    it('is not applicable below the minimum elevation or with unknown elevation', () => {
      const low = scoreOf(makeContext(powderDay, { elevationM: 120 }), ActivityType.SKIING);
      expect(low).toMatchObject({ applicable: false, score: null, rating: null });
      expect(low.reasons).toEqual(['Elevation 120 m is below 300 m']);
      expect(scoreOf(makeContext(powderDay, { elevationM: null }), ActivityType.SKIING).applicable).toBe(false);
    });

    it('respects the configured minimum elevation', () => {
      const strict = new ActivityScoringService({ skiMinElevationM: 2000 });
      const r = strict.calculate(makeContext(powderDay, MOUNTAIN)).find((x) => x.activity === ActivityType.SKIING)!;
      expect(r.applicable).toBe(false);
    });
  });

  describe('surfing', () => {
    it('clean mid-size swell is excellent', () => {
      const r = scoreOf(makeContext(goodSurf, COAST), ActivityType.SURFING);
      expect(r.score).toBeGreaterThanOrEqual(90);
      expect(r.rating).toBe(Rating.EXCELLENT);
      expect(r.reasons).toContain('Good waves 1.6 m');
    });

    it('flat sea is capped at 10', () => {
      const r = scoreOf(makeContext({ ...goodSurf, waveHeightM: 0.1 }, COAST), ActivityType.SURFING);
      expect(r.score).toBeLessThanOrEqual(10);
      expect(r.reasons[0]).toBe('Flat sea: waves 0.1 m');
    });

    it('storm waves or gusts are capped at 20', () => {
      expect(scoreOf(makeContext({ ...goodSurf, waveHeightM: 4.5 }, COAST), ActivityType.SURFING).score).toBeLessThanOrEqual(20);
      expect(scoreOf(makeContext({ ...goodSurf, windGustsKmh: 70 }, COAST), ActivityType.SURFING).score).toBeLessThanOrEqual(20);
    });

    it('onshore gale lowers the score', () => {
      const calm = scoreOf(makeContext(goodSurf, COAST), ActivityType.SURFING).score!;
      const windy = scoreOf(makeContext({ ...goodSurf, windSpeedKmh: 35, windGustsKmh: 50 }, COAST), ActivityType.SURFING).score!;
      expect(windy).toBeLessThan(calm - 15);
    });

    it('is not applicable without marine data', () => {
      for (const hasMarineData of [false, null]) {
        const r = scoreOf(makeContext(goodSurf, { hasMarineData }), ActivityType.SURFING);
        expect(r).toMatchObject({ applicable: false, score: null, reasons: ['No marine data for this location'] });
      }
    });

    it('missing wave data on a marine place is capped at 10', () => {
      const r = scoreOf(makeContext({ ...goodSurf, waveHeightM: null }, COAST), ActivityType.SURFING);
      expect(r.score).toBeLessThanOrEqual(10);
      expect(r.reasons).toContain('Wave data unknown');
    });
  });

  describe('outdoor sightseeing', () => {
    it('mild dry sunny day is excellent', () => {
      const r = scoreOf(makeContext(), ActivityType.OUTDOOR_SIGHTSEEING);
      expect(r.score).toBeGreaterThanOrEqual(85);
      expect(r.rating).toBe(Rating.EXCELLENT);
      expect(r.reasons).toEqual(expect.arrayContaining(['Dry day', 'Comfortable 18 °C']));
    });

    it('thunderstorm caps at 10', () => {
      const r = scoreOf(makeContext((h) => ({ weatherCode: h === 14 ? 95 : 1 })), ActivityType.OUTDOOR_SIGHTSEEING);
      expect(r.score).toBeLessThanOrEqual(10);
      expect(r.reasons[0]).toBe('Thunderstorm expected');
    });

    it('extreme heat and frost cap at 25', () => {
      expect(scoreOf(makeContext({ apparentTemperatureC: 41 }), ActivityType.OUTDOOR_SIGHTSEEING).score).toBeLessThanOrEqual(25);
      expect(scoreOf(makeContext({ apparentTemperatureC: -15 }), ActivityType.OUTDOOR_SIGHTSEEING).score).toBeLessThanOrEqual(25);
    });

    it('rainy day is poor', () => {
      const r = scoreOf(makeContext({ precipitationMm: 2, cloudCoverPct: 100, apparentTemperatureC: 9 }), ActivityType.OUTDOOR_SIGHTSEEING);
      expect(r.score).toBeLessThan(50);
      expect(r.reasons).toContain('Rain 20 mm');
    });

    it('missing data renormalises the weights and is reported', () => {
      const r = scoreOf(makeContext({ apparentTemperatureC: null, visibilityM: null }), ActivityType.OUTDOOR_SIGHTSEEING);
      expect(r.score).toBeGreaterThanOrEqual(85);
      expect(r.reasons).toContain('Missing data: apparentTemperature, visibility');
      expect(r.components.apparentTemperature).toEqual({ raw: null, score: null, weight: 0.25 });
    });

    it('scores 0 when nothing at all is known', () => {
      const r = scoreOf(
        makeContext({
          precipitationMm: null,
          apparentTemperatureC: null,
          cloudCoverPct: null,
          windSpeedKmh: null,
          visibilityM: null,
          isDay: null,
        }),
        ActivityType.OUTDOOR_SIGHTSEEING,
      );
      expect(r.score).toBe(0);
    });
  });

  describe('indoor sightseeing', () => {
    it('is always applicable and around 60 on a perfect outdoor day', () => {
      const r = scoreOf(makeContext(), ActivityType.INDOOR_SIGHTSEEING);
      expect(r.applicable).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(60);
      expect(r.score).toBeLessThanOrEqual(66);
    });

    it('rainy cold day is a great museum day', () => {
      const r = scoreOf(
        makeContext({ precipitationMm: 3, apparentTemperatureC: 2, cloudCoverPct: 100, windSpeedKmh: 30 }),
        ActivityType.INDOOR_SIGHTSEEING,
      );
      expect(r.score).toBeGreaterThanOrEqual(85);
      expect(r.reasons).toContain('Poor weather outside: a good day for museums');
    });

    it('dangerous roads take 20 points off', () => {
      const rainy = { precipitationMm: 3, apparentTemperatureC: 2, cloudCoverPct: 100 };
      const plain = scoreOf(makeContext(rainy), ActivityType.INDOOR_SIGHTSEEING).score!;
      const icy = scoreOf(makeContext((h) => ({ ...rainy, weatherCode: h === 6 ? 67 : 61 })), ActivityType.INDOOR_SIGHTSEEING);
      expect(icy.score).toBe(plain - 20);
      expect(icy.reasons[0]).toBe('Dangerous roads: freezing rain');
      const snowy = scoreOf(makeContext({ ...rainy, snowfallCm: 1 }), ActivityType.INDOOR_SIGHTSEEING);
      expect(snowy.score).toBe(plain - 20);
    });
  });

  describe('ratings and confidence', () => {
    it.each([
      [0, Confidence.HIGH],
      [2, Confidence.HIGH],
      [3, Confidence.MEDIUM],
      [4, Confidence.MEDIUM],
      [5, Confidence.LOW],
      [7, Confidence.LOW],
    ])('day %i ahead → %s', (daysAhead, confidence) => {
      for (const r of service.calculate(makeContext({}, { daysAhead }))) expect(r.confidence).toBe(confidence);
    });

    it('rating follows the score bands', () => {
      for (const r of service.calculate(makeContext({ precipitationMm: 0.6 }, { ...COAST, elevationM: 1500 }))) {
        if (r.score === null) continue;
        const expected =
          r.score >= 80 ? Rating.EXCELLENT : r.score >= 60 ? Rating.GOOD : r.score >= 40 ? Rating.FAIR : r.score >= 20 ? Rating.POOR : Rating.AVOID;
        expect(r.rating).toBe(expected);
      }
    });

    it('scores are integers within 0..100', () => {
      for (const r of service.calculate(makeContext(goodSurf, { ...COAST, elevationM: 1500 }))) {
        expect(Number.isInteger(r.score)).toBe(true);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      }
    });
  });
});
