import { Injectable } from '@nestjs/common';
import { ScoreComponent } from '../../models/activity-score.entity';
import { ActivityType, Confidence, Rating } from '../../models/enums';
import { CurvePoint, piecewiseLinear } from '../../utils/piecewise-linear';
import { DayWeatherContext, HoursWindow } from './day-weather.context';
import {
  CONFIDENCE_MAX_DAYS,
  DEFAULT_SKI_MIN_ELEVATION_M,
  INDOOR,
  OUTDOOR,
  RATING_MIN_SCORE,
  SKIING,
  SURFING,
} from './scoring.config';

export interface ActivityScoreResult {
  activity: ActivityType;
  applicable: boolean;
  /** 0..100, null when not applicable. */
  score: number | null;
  rating: Rating | null;
  confidence: Confidence;
  /** For a non-applicable activity the only reason explains why. */
  reasons: string[];
  components: Record<string, ScoreComponent>;
}

export interface ScoringOptions {
  skiMinElevationM: number;
}

interface Factor {
  key: string;
  raw: number | null;
  weight: number;
  curve: readonly CurvePoint[];
  /** Reason shown when the factor is clearly good (f ≥ 0.85). */
  good?: (raw: number) => string;
  /** Reason shown when the factor is clearly bad (f ≤ 0.3). */
  bad?: (raw: number) => string;
}

interface Cap {
  when: boolean;
  max: number;
  reason: string;
}

interface EvaluatedFactor extends Factor {
  score: number | null;
}

const MAX_REASONS = 4;
const GOOD_FACTOR = 0.85;
const BAD_FACTOR = 0.3;

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;


/**
 * Central scoring logic. Pure: weather context in, scores out, no I/O.
 * Formula: S = min(cap, 100 × Σ wᵢ · fᵢ(xᵢ)), weights of known factors renormalised to 1.
 */
@Injectable()
export class ActivityScoringService {
  private readonly options: ScoringOptions;

  constructor(options?: Partial<ScoringOptions>) {
    this.options = { skiMinElevationM: options?.skiMinElevationM ?? DEFAULT_SKI_MIN_ELEVATION_M };
  }

  /** Scores of all four activities for one day. */
  calculate(ctx: DayWeatherContext): ActivityScoreResult[] {
    return [
      this.calculateSkiing(ctx),
      this.calculateSurfing(ctx),
      this.calculateOutdoorSightseeing(ctx),
      this.calculateIndoorSightseeing(ctx),
    ];
  }

  private calculateSkiing(ctx: DayWeatherContext): ActivityScoreResult {
    const min = this.options.skiMinElevationM;
    if (ctx.elevationM === null) return this.notApplicable(ActivityType.SKIING, ctx, 'Elevation of this location is unknown');
    if (ctx.elevationM < min) {
      return this.notApplicable(ActivityType.SKIING, ctx, `Elevation ${r0(ctx.elevationM)} m is below ${min} m`);
    }

    const f = SKIING.factors;
    const c = SKIING.caps;
    const snow = ctx.snowDepthCm;
    const maxTemp = ctx.maxTemperatureC;
    const gust = ctx.maxGustKmh;
    const factors: Factor[] = [
      { key: 'snowDepth', raw: snow, ...f.snowDepth, good: (v) => `Deep snow base ${r0(v)} cm` },
      { key: 'freshSnow', raw: ctx.freshSnowCm, ...f.freshSnow, good: (v) => `Fresh snow ${r0(v)} cm` },
      {
        key: 'temperature',
        raw: ctx.daylight.avgTemperatureC,
        ...f.temperature,
        good: (v) => `Good skiing temperature ${r0(v)} °C`,
        bad: (v) => (v > 0 ? `Too warm: ${r0(v)} °C` : `Very cold: ${r0(v)} °C`),
      },
      { key: 'wind', raw: ctx.daylight.avgWindKmh, ...f.wind, bad: (v) => `Strong wind ${r0(v)} km/h` },
      { key: 'visibility', raw: ctx.daylight.avgVisibilityM, ...f.visibility, bad: (v) => `Poor visibility ${r1(v / 1000)} km` },
      { key: 'precipitation', raw: ctx.daylight.precipitationMm, ...f.precipitation, bad: (v) => `Precipitation ${r1(v)} mm` },
    ];
    const caps: Cap[] = [
      {
        when: snow === null || snow < c.minSnowDepthCm,
        max: c.noSnowCap,
        reason: snow === null ? 'Snow depth unknown' : `Not enough snow: ${r0(snow)} cm`,
      },
      {
        // Below minSnowDepthCm the no-snow cap (same value) already applies and explains it.
        when: snow !== null && snow >= c.minSnowDepthCm && snow < c.thawSnowDepthCm && maxTemp !== null && maxTemp > c.thawMaxTempC,
        max: c.thawCap,
        reason: `Thin snow (${r0(snow ?? 0)} cm) and thaw up to ${r0(maxTemp ?? 0)} °C`,
      },
      { when: gust !== null && gust > c.maxGustKmh, max: c.gustCap, reason: `Dangerous gusts ${r0(gust ?? 0)} km/h` },
    ];
    return this.build(ActivityType.SKIING, ctx, factors, caps);
  }

  private calculateSurfing(ctx: DayWeatherContext): ActivityScoreResult {
    if (ctx.hasMarineData !== true) return this.notApplicable(ActivityType.SURFING, ctx, 'No marine data for this location');

    const f = SURFING.factors;
    const c = SURFING.caps;
    const wave = ctx.avgWaveHeightM;
    const maxWave = ctx.daylight.maxWaveHeightM;
    const gust = ctx.maxGustKmh;
    const factors: Factor[] = [
      {
        key: 'waveHeight',
        raw: wave,
        ...f.waveHeight,
        good: (v) => `Good waves ${r1(v)} m`,
        bad: (v) => (v < 1 ? `Small waves ${r1(v)} m` : `Very big waves ${r1(v)} m`),
      },
      {
        key: 'swellPeriod',
        raw: ctx.daylight.avgSwellPeriodS,
        ...f.swellPeriod,
        good: (v) => `Long swell period ${r0(v)} s`,
        bad: (v) => `Short, choppy swell ${r0(v)} s`,
      },
      { key: 'wind', raw: ctx.daylight.avgWindKmh, ...f.wind, good: () => 'Light wind', bad: (v) => `Strong wind ${r0(v)} km/h` },
      {
        key: 'temperature',
        raw: ctx.daylight.avgSeaTemperatureC ?? ctx.daylight.avgTemperatureC,
        ...f.temperature,
        bad: (v) => `Cold water ${r0(v)} °C`,
      },
      { key: 'rain', raw: ctx.daylight.precipitationMm, ...f.rain, bad: (v) => `Rain ${r1(v)} mm` },
    ];
    const caps: Cap[] = [
      {
        when: wave === null || wave < c.minWaveM,
        max: c.flatCap,
        reason: wave === null ? 'Wave data unknown' : `Flat sea: waves ${r1(wave)} m`,
      },
      { when: maxWave !== null && maxWave > c.maxWaveM, max: c.stormCap, reason: `Storm waves up to ${r1(maxWave ?? 0)} m` },
      { when: gust !== null && gust > c.maxGustKmh, max: c.stormCap, reason: `Dangerous gusts ${r0(gust ?? 0)} km/h` },
    ];
    return this.build(ActivityType.SURFING, ctx, factors, caps);
  }

  private calculateOutdoorSightseeing(ctx: DayWeatherContext): ActivityScoreResult {
    const c = OUTDOOR.caps;
    const w = ctx.daylight;
    const minApparent = w.minApparentTemperatureC;
    const maxApparent = w.maxApparentTemperatureC;
    const caps: Cap[] = [
      { when: ctx.hasThunderstorm, max: c.thunderstormCap, reason: 'Thunderstorm expected' },
      { when: minApparent !== null && minApparent < c.minApparentC, max: c.extremeTempCap, reason: `Feels like ${r0(minApparent ?? 0)} °C` },
      { when: maxApparent !== null && maxApparent > c.maxApparentC, max: c.extremeTempCap, reason: `Feels like ${r0(maxApparent ?? 0)} °C` },
    ];
    return this.build(ActivityType.OUTDOOR_SIGHTSEEING, ctx, this.outdoorFactors(w, ctx), caps);
  }

  /** 60 + 40 × (1 − outdoor comfort), minus a penalty when getting there is dangerous. */
  private calculateIndoorSightseeing(ctx: DayWeatherContext): ActivityScoreResult {
    const evaluated = this.evaluate(this.outdoorFactors(ctx.indoorHours, ctx));
    const known = evaluated.filter((e) => e.score !== null);
    const comfort = known.length ? this.weightedScore(known, []) / 100 : 0.5;

    const dangers: string[] = [];
    if (ctx.hasHeavySnow) dangers.push('heavy snow');
    if (ctx.hasFreezingRain) dangers.push('freezing rain');
    const gust = ctx.maxGustAllDayKmh;
    if (gust !== null && gust > INDOOR.dangerGustKmh) dangers.push(`gusts ${r0(gust)} km/h`);

    let score = INDOOR.base + INDOOR.span * (1 - comfort);
    if (dangers.length) score -= INDOOR.dangerPenalty;
    score = this.clamp(score);

    const reasons: string[] = [];
    if (dangers.length) reasons.push(`Dangerous roads: ${dangers.join(', ')}`);
    if (comfort < 0.4) reasons.push('Poor weather outside: a good day for museums');
    else if (comfort > 0.75) reasons.push('Pleasant weather outside: consider going out');

    const components: Record<string, ScoreComponent> = {
      outdoorComfort: { raw: Math.round(comfort * 1000) / 1000, score: Math.round((1 - comfort) * 1000) / 1000, weight: 1 },
    };
    for (const e of evaluated) components[`outdoor.${e.key}`] = { raw: e.raw, score: e.score, weight: e.weight };
    if (dangers.length) components.dangerPenalty = { raw: dangers.length, score: -INDOOR.dangerPenalty, weight: 1 };

    return {
      activity: ActivityType.INDOOR_SIGHTSEEING,
      applicable: true,
      score,
      rating: this.toRating(score),
      confidence: this.toConfidence(ctx.daysAhead),
      reasons,
      components,
    };
  }

  /** Comfort factors of being outside, shared by outdoor and indoor sightseeing. */
  private outdoorFactors(w: HoursWindow, ctx: DayWeatherContext): Factor[] {
    const f = OUTDOOR.factors;
    return [
      { key: 'precipitation', raw: w.precipitationMm, ...f.precipitation, good: () => 'Dry day', bad: (v) => `Rain ${r1(v)} mm` },
      {
        key: 'apparentTemperature',
        raw: w.avgApparentTemperatureC,
        ...f.apparentTemperature,
        good: (v) => `Comfortable ${r0(v)} °C`,
        bad: (v) => (v < 12 ? `Cold: feels like ${r0(v)} °C` : `Hot: feels like ${r0(v)} °C`),
      },
      { key: 'sunshine', raw: w.avgCloudCoverPct, ...f.sunshine, good: () => 'Mostly sunny' },
      { key: 'dayLength', raw: ctx.daylightHours, ...f.dayLength, bad: (v) => `Short day: ${r0(v)} h of daylight` },
      { key: 'wind', raw: w.avgWindKmh, ...f.wind, bad: (v) => `Strong wind ${r0(v)} km/h` },
      { key: 'visibility', raw: w.avgVisibilityM, ...f.visibility, bad: (v) => `Poor visibility ${r1(v / 1000)} km` },
    ];
  }

  private build(activity: ActivityType, ctx: DayWeatherContext, factors: Factor[], caps: Cap[]): ActivityScoreResult {
    const evaluated = this.evaluate(factors);
    const score = this.weightedScore(evaluated, caps);

    const reasons = caps.filter((c) => c.when).map((c) => c.reason);
    const missing = evaluated.filter((e) => e.score === null);
    const byWeight = [...evaluated].sort((a, b) => b.weight - a.weight);
    for (const e of byWeight) {
      if (e.score !== null && e.raw !== null && e.score <= BAD_FACTOR && e.bad) reasons.push(e.bad(e.raw));
    }
    for (const e of byWeight) {
      if (e.score !== null && e.raw !== null && e.score >= GOOD_FACTOR && e.good) reasons.push(e.good(e.raw));
    }
    const unique = [...new Set(reasons)].slice(0, MAX_REASONS);
    if (missing.length) unique.push(`Missing data: ${missing.map((m) => m.key).join(', ')}`);

    const components: Record<string, ScoreComponent> = {};
    for (const e of evaluated) {
      components[e.key] = { raw: e.raw === null ? null : r1(e.raw), score: e.score === null ? null : r1(e.score * 100) / 100, weight: e.weight };
    }

    return {
      activity,
      applicable: true,
      score,
      rating: this.toRating(score),
      confidence: this.toConfidence(ctx.daysAhead),
      reasons: unique,
      components,
    };
  }

  private evaluate(factors: Factor[]): EvaluatedFactor[] {
    return factors.map((f) => ({ ...f, score: f.raw === null ? null : piecewiseLinear(f.curve)(f.raw) }));
  }

  /**
   * 100 × Σ wᵢ · fᵢ over known factors (weights renormalised so missing data is neither 0 nor 1),
   * then limited by the lowest active cap. No known factor at all gives 0.
   */
  private weightedScore(factors: EvaluatedFactor[], caps: Cap[]): number {
    const known = factors.filter((f) => f.score !== null);
    const totalWeight = known.reduce((s, f) => s + f.weight, 0);
    let score = totalWeight > 0 ? (100 * known.reduce((s, f) => s + f.weight * (f.score as number), 0)) / totalWeight : 0;
    for (const cap of caps) if (cap.when) score = Math.min(score, cap.max);
    return this.clamp(score);
  }

  private toRating(score: number): Rating {
    if (score >= RATING_MIN_SCORE.EXCELLENT) return Rating.EXCELLENT;
    if (score >= RATING_MIN_SCORE.GOOD) return Rating.GOOD;
    if (score >= RATING_MIN_SCORE.FAIR) return Rating.FAIR;
    if (score >= RATING_MIN_SCORE.POOR) return Rating.POOR;
    return Rating.AVOID;
  }

  private toConfidence(daysAhead: number): Confidence {
    if (daysAhead <= CONFIDENCE_MAX_DAYS.HIGH) return Confidence.HIGH;
    if (daysAhead <= CONFIDENCE_MAX_DAYS.MEDIUM) return Confidence.MEDIUM;
    return Confidence.LOW;
  }

  private notApplicable(activity: ActivityType, ctx: DayWeatherContext, reason: string): ActivityScoreResult {
    return {
      activity,
      applicable: false,
      score: null,
      rating: null,
      confidence: this.toConfidence(ctx.daysAhead),
      reasons: [reason],
      components: {},
    };
  }

  private clamp(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
