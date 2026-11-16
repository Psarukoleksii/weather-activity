import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HourWeather } from '../../models/weather-hourly.entity';
import type { OpenMeteoConfigType } from './open-meteo-config.type';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

export const FORECAST_DAYS = 8;

/** Open-Meteo variable name → our field. Names checked against the live API. */
const FORECAST_VARIABLES = {
  temperature_2m: 'temperatureC',
  apparent_temperature: 'apparentTemperatureC',
  precipitation: 'precipitationMm',
  precipitation_probability: 'precipitationProbabilityPct',
  snowfall: 'snowfallCm',
  snow_depth: 'snowDepthM',
  cloud_cover: 'cloudCoverPct',
  wind_speed_10m: 'windSpeedKmh',
  wind_gusts_10m: 'windGustsKmh',
  visibility: 'visibilityM',
  weather_code: 'weatherCode',
  is_day: 'isDay',
} as const satisfies Record<string, keyof HourWeather>;

const MARINE_VARIABLES = {
  wave_height: 'waveHeightM',
  wave_period: 'wavePeriodS',
  swell_wave_height: 'swellWaveHeightM',
  swell_wave_period: 'swellWavePeriodS',
  sea_surface_temperature: 'seaSurfaceTemperatureC',
} as const satisfies Record<string, keyof HourWeather>;

export type ForecastHour = Pick<HourWeather, 'validAt' | (typeof FORECAST_VARIABLES)[keyof typeof FORECAST_VARIABLES]>;
export type MarineHour = Pick<HourWeather, 'validAt' | (typeof MARINE_VARIABLES)[keyof typeof MARINE_VARIABLES]>;

export interface GeocodingResult {
  geonameId: string;
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  timezone: string;
}

/** Open-Meteo did not answer, timed out or answered with an error. */
export class UpstreamUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UpstreamUnavailableError';
  }
}

type Json = Record<string, any>;

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** First result of the geocoder that matches the country, or null. */
export function parseGeocoding(body: Json, countryCode: string): GeocodingResult | null {
  const results: Json[] = Array.isArray(body?.results) ? body.results : [];
  const hit = results.find((r) => String(r.country_code).toUpperCase() === countryCode.toUpperCase());
  if (!hit) return null;
  return {
    geonameId: String(hit.id),
    name: String(hit.name),
    countryCode: String(hit.country_code).toUpperCase(),
    latitude: Number(hit.latitude),
    longitude: Number(hit.longitude),
    elevationM: numOrNull(hit.elevation),
    timezone: String(hit.timezone),
  };
}

function parseHourly<F extends string>(body: Json, variables: Record<string, F>): Array<{ validAt: Date } & Record<F, unknown>> {
  const hourly: Json | undefined = body?.hourly;
  const times: unknown[] = Array.isArray(hourly?.time) ? hourly!.time : [];
  return times.map((t, i) => {
    const row: Json = { validAt: new Date(Number(t) * 1000) };
    for (const [apiName, field] of Object.entries(variables)) {
      const series = hourly?.[apiName];
      row[field] = Array.isArray(series) ? (series[i] ?? null) : null;
    }
    return row as { validAt: Date } & Record<F, unknown>;
  });
}

/** Forecast response (timeformat=unixtime) → hourly rows in UTC; null stays null. */
export function parseForecast(body: Json): ForecastHour[] {
  return parseHourly(body, FORECAST_VARIABLES).map((r) => ({
    validAt: r.validAt,
    temperatureC: numOrNull(r.temperatureC),
    apparentTemperatureC: numOrNull(r.apparentTemperatureC),
    precipitationMm: numOrNull(r.precipitationMm),
    precipitationProbabilityPct: numOrNull(r.precipitationProbabilityPct),
    snowfallCm: numOrNull(r.snowfallCm),
    snowDepthM: numOrNull(r.snowDepthM),
    cloudCoverPct: numOrNull(r.cloudCoverPct),
    windSpeedKmh: numOrNull(r.windSpeedKmh),
    windGustsKmh: numOrNull(r.windGustsKmh),
    visibilityM: numOrNull(r.visibilityM),
    weatherCode: numOrNull(r.weatherCode),
    isDay: r.isDay === null || r.isDay === undefined ? null : Number(r.isDay) === 1,
  }));
}

/** Marine response → hourly rows. Inland points come back as all-null series. */
export function parseMarine(body: Json): MarineHour[] {
  return parseHourly(body, MARINE_VARIABLES).map((r) => ({
    validAt: r.validAt,
    waveHeightM: numOrNull(r.waveHeightM),
    wavePeriodS: numOrNull(r.wavePeriodS),
    swellWaveHeightM: numOrNull(r.swellWaveHeightM),
    swellWavePeriodS: numOrNull(r.swellWavePeriodS),
    seaSurfaceTemperatureC: numOrNull(r.seaSurfaceTemperatureC),
  }));
}

@Injectable()
export class OpenMeteoClient {
  private readonly logger = new Logger(OpenMeteoClient.name);
  private readonly timeoutMs: number;

  constructor(config: ConfigService<OpenMeteoConfigType, true>) {
    this.timeoutMs = config.getOrThrow('openMeteo.callTimeoutSeconds', { infer: true }) * 1000;
  }

  async geocode(name: string, countryCode: string): Promise<GeocodingResult | null> {
    const body = await this.get(GEOCODING_URL, {
      name,
      count: '10',
      language: 'en',
      format: 'json',
      countryCode: countryCode.toUpperCase(),
    });
    return parseGeocoding(body, countryCode);
  }

  async forecast(latitude: number, longitude: number): Promise<ForecastHour[]> {
    const body = await this.get(FORECAST_URL, {
      latitude: String(latitude),
      longitude: String(longitude),
      hourly: Object.keys(FORECAST_VARIABLES).join(','),
      forecast_days: String(FORECAST_DAYS),
      timezone: 'auto',
      timeformat: 'unixtime',
    });
    return parseForecast(body);
  }

  async marine(latitude: number, longitude: number): Promise<MarineHour[]> {
    const body = await this.get(MARINE_URL, {
      latitude: String(latitude),
      longitude: String(longitude),
      hourly: Object.keys(MARINE_VARIABLES).join(','),
      forecast_days: String(FORECAST_DAYS),
      timezone: 'auto',
      timeformat: 'unixtime',
    });
    return parseMarine(body);
  }

  private async get(baseUrl: string, params: Record<string, string>): Promise<Json> {
    const url = `${baseUrl}?${new URLSearchParams(params)}`;
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new UpstreamUnavailableError(`Open-Meteo call failed: ${baseUrl}`, { cause: err });
    }
    this.logger.log(`GET ${baseUrl} → ${res.status} in ${Date.now() - started} ms`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new UpstreamUnavailableError(`Open-Meteo ${baseUrl} answered ${res.status}: ${text.slice(0, 200)}`);
    }
    try {
      return (await res.json()) as Json;
    } catch (err) {
      throw new UpstreamUnavailableError(`Open-Meteo ${baseUrl} returned invalid JSON`, { cause: err });
    }
  }
}
