import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Place } from '../../models/place.entity';
import { HourWeather, WeatherHourly } from '../../models/weather-hourly.entity';
import { MarineHour, OpenMeteoClient } from './open-meteo.client';

const EMPTY_MARINE: Omit<MarineHour, 'validAt'> = {
  waveHeightM: null,
  wavePeriodS: null,
  swellWaveHeightM: null,
  swellWavePeriodS: null,
  seaSurfaceTemperatureC: null,
};

export interface FetchedWeather {
  hours: HourWeather[];
  /** New value for places.has_marine_data. */
  hasMarineData: boolean | null;
}

const UPDATE_COLUMNS = [
  'temperature_c',
  'apparent_temperature_c',
  'precipitation_mm',
  'precipitation_probability_pct',
  'snowfall_cm',
  'snow_depth_m',
  'cloud_cover_pct',
  'wind_speed_kmh',
  'wind_gusts_kmh',
  'visibility_m',
  'weather_code',
  'is_day',
  'wave_height_m',
  'wave_period_s',
  'swell_wave_height_m',
  'swell_wave_period_s',
  'sea_surface_temperature_c',
  'fetched_at',
];

@Injectable()
export class WeatherService {
  constructor(private readonly openMeteo: OpenMeteoClient) {}

  /**
   * Forecast for 8 days plus marine data (unless the place is known to have none).
   * The first marine check with all-null waves marks the place as `has_marine_data = false`.
   */
  async fetchHourly(place: Place): Promise<FetchedWeather> {
    const wantMarine = place.hasMarineData !== false;
    const [forecast, marine] = await Promise.all([
      this.openMeteo.forecast(place.latitude, place.longitude),
      wantMarine ? this.openMeteo.marine(place.latitude, place.longitude) : Promise.resolve([] as MarineHour[]),
    ]);

    let hasMarineData = place.hasMarineData;
    if (place.hasMarineData === null) {
      hasMarineData = marine.some((h) => h.waveHeightM !== null);
    }

    const marineByTime = new Map<number, MarineHour>();
    if (hasMarineData) for (const m of marine) marineByTime.set(m.validAt.getTime(), m);

    const hours: HourWeather[] = forecast.map((f) => {
      const m = marineByTime.get(f.validAt.getTime());
      const { validAt: _ignored, ...marineFields } = m ?? { validAt: f.validAt, ...EMPTY_MARINE };
      return { ...f, ...marineFields };
    });
    return { hours, hasMarineData };
  }

  /** Upsert by (place_id, valid_at); repeated calls do not add rows. */
  async upsertHourly(em: EntityManager, placeId: string, hours: HourWeather[], fetchedAt: Date): Promise<void> {
    if (hours.length === 0) return;
    const rows = hours.map((h) => ({ ...h, placeId, fetchedAt }));
    await em
      .createQueryBuilder()
      .insert()
      .into(WeatherHourly)
      .values(rows)
      .orUpdate(UPDATE_COLUMNS, ['place_id', 'valid_at'])
      .execute();
  }
}
