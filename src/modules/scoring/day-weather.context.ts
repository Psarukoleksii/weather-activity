import { HourWeather } from '../../models/weather-hourly.entity';
import { avg, max, min, sum } from '../../utils/stats';
import { FALLBACK_DAYLIGHT_HOURS, INDOOR_HOURS, INDOOR, WEATHER_CODES } from './scoring.config';

export interface ContextHour extends HourWeather {
  /** 0..23 in the place's time zone. */
  localHour: number;
}

const hasCode = (hours: readonly ContextHour[], codes: readonly number[]) =>
  hours.some((h) => h.weatherCode !== null && codes.includes(h.weatherCode));

/** Aggregations over a set of hours. Every getter returns null when nothing is known. */
export class HoursWindow {
  constructor(readonly hours: readonly ContextHour[]) {}

  get count(): number {
    return this.hours.length;
  }

  get avgTemperatureC() {
    return avg(this.hours.map((h) => h.temperatureC));
  }
  get maxTemperatureC() {
    return max(this.hours.map((h) => h.temperatureC));
  }
  get avgApparentTemperatureC() {
    return avg(this.hours.map((h) => h.apparentTemperatureC));
  }
  get minApparentTemperatureC() {
    return min(this.hours.map((h) => h.apparentTemperatureC));
  }
  get maxApparentTemperatureC() {
    return max(this.hours.map((h) => h.apparentTemperatureC));
  }
  get precipitationMm() {
    return sum(this.hours.map((h) => h.precipitationMm));
  }
  get avgCloudCoverPct() {
    return avg(this.hours.map((h) => h.cloudCoverPct));
  }
  get avgWindKmh() {
    return avg(this.hours.map((h) => h.windSpeedKmh));
  }
  get maxGustKmh() {
    return max(this.hours.map((h) => h.windGustsKmh));
  }
  get avgVisibilityM() {
    return avg(this.hours.map((h) => h.visibilityM));
  }
  get avgWaveHeightM() {
    return avg(this.hours.map((h) => h.waveHeightM));
  }
  get maxWaveHeightM() {
    return max(this.hours.map((h) => h.waveHeightM));
  }
  /** Swell period, falling back to the total wave period hour by hour. */
  get avgSwellPeriodS() {
    return avg(this.hours.map((h) => h.swellWavePeriodS ?? h.wavePeriodS));
  }
  get avgSeaTemperatureC() {
    return avg(this.hours.map((h) => h.seaSurfaceTemperatureC));
  }
  get hasThunderstorm(): boolean {
    return hasCode(this.hours, WEATHER_CODES.thunderstorm);
  }
}

export interface DayWeatherInput {
  /** 'YYYY-MM-DD' in the place's time zone. */
  localDate: string;
  /** 0 = today. */
  daysAhead: number;
  elevationM: number | null;
  hasMarineData: boolean | null;
  hours: readonly ContextHour[];
}

/** Weather of one local day of one place, with aggregation hidden behind getters. */
export class DayWeatherContext {
  readonly localDate: string;
  readonly daysAhead: number;
  readonly elevationM: number | null;
  readonly hasMarineData: boolean | null;
  /** The whole local day (23–25 hours around DST changes). */
  readonly allDay: HoursWindow;
  /** Daylight hours; skiing, surfing and outdoor sightseeing are scored on them. */
  readonly daylight: HoursWindow;
  /** 09:00–18:00 local time; indoor sightseeing is scored on them. */
  readonly indoorHours: HoursWindow;

  constructor(input: DayWeatherInput) {
    this.localDate = input.localDate;
    this.daysAhead = input.daysAhead;
    this.elevationM = input.elevationM;
    this.hasMarineData = input.hasMarineData;
    const hours = [...input.hours].sort((a, b) => a.validAt.getTime() - b.validAt.getTime());
    this.allDay = new HoursWindow(hours);
    this.indoorHours = new HoursWindow(hours.filter((h) => h.localHour >= INDOOR_HOURS.from && h.localHour < INDOOR_HOURS.to));

    const dayFlagsKnown = hours.some((h) => h.isDay !== null);
    const daylight = dayFlagsKnown
      ? hours.filter((h) => h.isDay === true)
      : hours.filter((h) => h.localHour >= FALLBACK_DAYLIGHT_HOURS.from && h.localHour < FALLBACK_DAYLIGHT_HOURS.to);
    // Polar night: no daylight at all, score on the indoor window instead of nothing.
    this.daylight = daylight.length > 0 ? new HoursWindow(daylight) : this.indoorHours;
    this.daylightHoursCount = dayFlagsKnown ? daylight.length : null;
  }

  private readonly daylightHoursCount: number | null;

  /** Number of daylight hours; null when the forecast has no is_day flags. */
  get daylightHours(): number | null {
    return this.daylightHoursCount;
  }

  /** Max snow depth of the day in cm, so snow that fell in the morning counts. */
  get snowDepthCm(): number | null {
    const m = this.allDay.hours.map((h) => h.snowDepthM);
    const value = max(m);
    return value === null ? null : value * 100;
  }

  /** Snow fallen during the whole local day, cm. */
  get freshSnowCm(): number | null {
    return sum(this.allDay.hours.map((h) => h.snowfallCm));
  }

  get maxTemperatureC(): number | null {
    return this.daylight.maxTemperatureC;
  }
  get maxGustKmh(): number | null {
    return this.daylight.maxGustKmh;
  }
  get maxGustAllDayKmh(): number | null {
    return this.allDay.maxGustKmh;
  }
  get avgWaveHeightM(): number | null {
    return this.daylight.avgWaveHeightM;
  }
  get hasThunderstorm(): boolean {
    return this.daylight.hasThunderstorm;
  }
  get hasFreezingRain(): boolean {
    return hasCode(this.allDay.hours, WEATHER_CODES.freezingRain);
  }
  get hasHeavySnow(): boolean {
    return hasCode(this.allDay.hours, WEATHER_CODES.heavySnow) || (this.freshSnowCm ?? 0) >= INDOOR.heavySnowCm;
  }
}
