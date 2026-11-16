import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Place } from './place.entity';

/** One forecast hour of one place. `null` means "unknown", never zero. */
@Entity('weather_hourly')
export class WeatherHourly extends BaseEntity {
  @PrimaryColumn({ name: 'place_id', type: 'bigint' })
  placeId: string;

  /** UTC instant of the hour start. */
  @PrimaryColumn({ name: 'valid_at', type: 'timestamptz' })
  validAt: Date;

  @ManyToOne(() => Place, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place?: Place;

  // Atmosphere
  @Column({ name: 'temperature_c', type: 'real', nullable: true })
  temperatureC: number | null;

  @Column({ name: 'apparent_temperature_c', type: 'real', nullable: true })
  apparentTemperatureC: number | null;

  @Column({ name: 'precipitation_mm', type: 'real', nullable: true })
  precipitationMm: number | null;

  @Column({ name: 'precipitation_probability_pct', type: 'smallint', nullable: true })
  precipitationProbabilityPct: number | null;

  @Column({ name: 'snowfall_cm', type: 'real', nullable: true })
  snowfallCm: number | null;

  @Column({ name: 'snow_depth_m', type: 'real', nullable: true })
  snowDepthM: number | null;

  @Column({ name: 'cloud_cover_pct', type: 'smallint', nullable: true })
  cloudCoverPct: number | null;

  @Column({ name: 'wind_speed_kmh', type: 'real', nullable: true })
  windSpeedKmh: number | null;

  @Column({ name: 'wind_gusts_kmh', type: 'real', nullable: true })
  windGustsKmh: number | null;

  @Column({ name: 'visibility_m', type: 'real', nullable: true })
  visibilityM: number | null;

  @Column({ name: 'weather_code', type: 'smallint', nullable: true })
  weatherCode: number | null;

  @Column({ name: 'is_day', type: 'boolean', nullable: true })
  isDay: boolean | null;

  // Marine
  @Column({ name: 'wave_height_m', type: 'real', nullable: true })
  waveHeightM: number | null;

  @Column({ name: 'wave_period_s', type: 'real', nullable: true })
  wavePeriodS: number | null;

  @Column({ name: 'swell_wave_height_m', type: 'real', nullable: true })
  swellWaveHeightM: number | null;

  @Column({ name: 'swell_wave_period_s', type: 'real', nullable: true })
  swellWavePeriodS: number | null;

  @Column({ name: 'sea_surface_temperature_c', type: 'real', nullable: true })
  seaSurfaceTemperatureC: number | null;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;
}

/** Weather of one hour without storage columns: what Open-Meteo gives and scoring consumes. */
export type HourWeather = Omit<WeatherHourly, keyof BaseEntity | 'placeId' | 'place' | 'fetchedAt'>;
