import { HourWeather } from '../../../models/weather-hourly.entity';
import { ContextHour, DayWeatherContext } from '../day-weather.context';

/** Mild, dry, sunny hour; tests override what they care about. */
export const PLEASANT_HOUR: Omit<HourWeather, 'validAt'> = {
  temperatureC: 18,
  apparentTemperatureC: 18,
  precipitationMm: 0,
  precipitationProbabilityPct: 0,
  snowfallCm: 0,
  snowDepthM: 0,
  cloudCoverPct: 10,
  windSpeedKmh: 8,
  windGustsKmh: 15,
  visibilityM: 30000,
  weatherCode: 1,
  isDay: null,
  waveHeightM: null,
  wavePeriodS: null,
  swellWaveHeightM: null,
  swellWavePeriodS: null,
  seaSurfaceTemperatureC: null,
};

type HourOverrides = Partial<Omit<HourWeather, 'validAt'>>;

/** 24 hours of 2026-11-16 (UTC = local), daylight 07:00–16:59 unless isDay is overridden. */
export function makeHours(overrides: HourOverrides | ((localHour: number) => HourOverrides) = {}): ContextHour[] {
  return Array.from({ length: 24 }, (_, localHour) => {
    const extra = typeof overrides === 'function' ? overrides(localHour) : overrides;
    return {
      ...PLEASANT_HOUR,
      isDay: localHour >= 7 && localHour < 17,
      ...extra,
      validAt: new Date(Date.UTC(2026, 10, 16, localHour)),
      localHour,
    };
  });
}

export function makeContext(
  overrides: HourOverrides | ((localHour: number) => HourOverrides) = {},
  day: { daysAhead?: number; elevationM?: number | null; hasMarineData?: boolean | null } = {},
): DayWeatherContext {
  return new DayWeatherContext({
    localDate: '2026-11-16',
    daysAhead: day.daysAhead ?? 0,
    elevationM: day.elevationM === undefined ? 100 : day.elevationM,
    hasMarineData: day.hasMarineData === undefined ? false : day.hasMarineData,
    hours: makeHours(overrides),
  });
}
