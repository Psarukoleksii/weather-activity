import { CurvePoint } from '../../utils/piecewise-linear';

/** Bump when weights, curves or caps change: stored scores record which version made them. */
export const ALGO_VERSION = 1;

export const DEFAULT_SKI_MIN_ELEVATION_M = 300;

/** Indoor sightseeing looks at local opening hours [from, to). */
export const INDOOR_HOURS = { from: 9, to: 18 } as const;

/** Used when the forecast has no is_day flags at all. */
export const FALLBACK_DAYLIGHT_HOURS = { from: 8, to: 18 } as const;

/** Minimum score for each rating, from best to worst; below the last one is AVOID. */
export const RATING_MIN_SCORE = { EXCELLENT: 80, GOOD: 60, FAIR: 40, POOR: 20 } as const;

/** Days ahead (0 = today) up to which the confidence holds. */
export const CONFIDENCE_MAX_DAYS = { HIGH: 2, MEDIUM: 4 } as const;

/** WMO weather codes. */
export const WEATHER_CODES = {
  thunderstorm: [95, 96, 99],
  freezingRain: [56, 57, 66, 67],
  heavySnow: [75, 86],
} as const;

interface FactorConfig {
  weight: number;
  curve: readonly CurvePoint[];
}

export const SKIING = {
  factors: {
    snowDepth: { weight: 0.3, curve: [[10, 0], [30, 0.5], [80, 1]] }, // cm, max of the day
    freshSnow: { weight: 0.15, curve: [[0, 0.3], [5, 0.7], [10, 1]] }, // cm fallen during the day
    temperature: { weight: 0.2, curve: [[-25, 0], [-12, 1], [-2, 1], [3, 0.3], [8, 0]] }, // °C daylight avg
    wind: { weight: 0.15, curve: [[0, 1], [20, 1], [40, 0.4], [60, 0]] }, // km/h daylight avg
    visibility: { weight: 0.1, curve: [[500, 0], [5000, 0.6], [10000, 1]] }, // m daylight avg
    precipitation: { weight: 0.1, curve: [[0, 1], [2, 0.7], [10, 0]] }, // mm daylight sum
  } satisfies Record<string, FactorConfig>,
  caps: {
    minSnowDepthCm: 10,
    noSnowCap: 10,
    thawSnowDepthCm: 20,
    thawMaxTempC: 3,
    thawCap: 10,
    maxGustKmh: 70,
    gustCap: 15,
  },
} as const;

export const SURFING = {
  factors: {
    waveHeight: { weight: 0.35, curve: [[0.3, 0], [1, 1], [2.5, 1], [4, 0]] }, // m daylight avg
    swellPeriod: { weight: 0.2, curve: [[4, 0], [10, 1]] }, // s daylight avg
    wind: { weight: 0.25, curve: [[0, 1], [15, 1], [30, 0.4], [45, 0]] }, // km/h daylight avg
    temperature: { weight: 0.1, curve: [[8, 0.1], [14, 0.5], [18, 0.8], [22, 1]] }, // °C sea, else air
    rain: { weight: 0.1, curve: [[0, 1], [3, 0.6], [10, 0]] }, // mm daylight sum
  } satisfies Record<string, FactorConfig>,
  caps: {
    minWaveM: 0.3,
    flatCap: 10,
    maxWaveM: 4,
    maxGustKmh: 60,
    stormCap: 20,
  },
} as const;

export const OUTDOOR = {
  factors: {
    precipitation: { weight: 0.35, curve: [[0, 1], [1, 0.8], [5, 0.3], [15, 0]] }, // mm sum
    apparentTemperature: { weight: 0.25, curve: [[-10, 0], [5, 0.4], [12, 1], [25, 1], [32, 0.4], [38, 0]] }, // °C avg
    sunshine: { weight: 0.15, curve: [[0, 1], [30, 1], [100, 0.2]] }, // cloud cover % avg
    dayLength: { weight: 0.1, curve: [[6, 0], [10, 0.7], [14, 1]] }, // daylight hours
    wind: { weight: 0.1, curve: [[0, 1], [15, 1], [30, 0.5], [50, 0]] }, // km/h avg
    visibility: { weight: 0.05, curve: [[1000, 0], [10000, 1]] }, // m avg
  } satisfies Record<string, FactorConfig>,
  caps: {
    thunderstormCap: 10,
    minApparentC: -10,
    maxApparentC: 38,
    extremeTempCap: 25,
  },
} as const;

export const INDOOR = {
  base: 60,
  /** score = base + span × (1 − outdoor comfort) */
  span: 40,
  dangerPenalty: 20,
  dangerGustKmh: 80,
  heavySnowCm: 10,
} as const;
