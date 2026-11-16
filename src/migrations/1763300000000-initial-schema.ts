import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1763300000000 implements MigrationInterface {
  name = 'InitialSchema1763300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE places (
        id                bigserial PRIMARY KEY,
        geoname_id        bigint NOT NULL,
        name              text NOT NULL,
        name_normalized   text NOT NULL,
        country_code      char(2) NOT NULL,
        latitude          double precision NOT NULL,
        longitude         double precision NOT NULL,
        elevation_m       real NULL,
        timezone          text NOT NULL,
        has_marine_data   boolean NULL,
        last_requested_at timestamptz NOT NULL DEFAULT now(),
        last_fetched_at   timestamptz NULL,
        last_attempt_at   timestamptz NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_places_geoname_id UNIQUE (geoname_id)
      )`);
    await q.query(`CREATE INDEX idx_places_name_country ON places (name_normalized, country_code)`);
    await q.query(`CREATE INDEX idx_places_last_requested_at ON places (last_requested_at)`);

    await q.query(`
      CREATE TABLE weather_hourly (
        place_id                      bigint NOT NULL REFERENCES places (id) ON DELETE CASCADE,
        valid_at                      timestamptz NOT NULL,
        temperature_c                 real NULL,
        apparent_temperature_c        real NULL,
        precipitation_mm              real NULL,
        precipitation_probability_pct smallint NULL,
        snowfall_cm                   real NULL,
        snow_depth_m                  real NULL,
        cloud_cover_pct               smallint NULL,
        wind_speed_kmh                real NULL,
        wind_gusts_kmh                real NULL,
        visibility_m                  real NULL,
        weather_code                  smallint NULL,
        is_day                        boolean NULL,
        wave_height_m                 real NULL,
        wave_period_s                 real NULL,
        swell_wave_height_m           real NULL,
        swell_wave_period_s           real NULL,
        sea_surface_temperature_c     real NULL,
        fetched_at                    timestamptz NOT NULL,
        PRIMARY KEY (place_id, valid_at)
      )`);

    await q.query(`
      CREATE TABLE activity_scores (
        place_id     bigint NOT NULL REFERENCES places (id) ON DELETE CASCADE,
        activity     varchar(32) NOT NULL,
        local_date   date NOT NULL,
        applicable   boolean NOT NULL,
        score        smallint NULL CHECK (score BETWEEN 0 AND 100),
        rating       varchar(16) NULL,
        confidence   varchar(16) NOT NULL,
        reasons      jsonb NOT NULL DEFAULT '[]',
        components   jsonb NOT NULL DEFAULT '{}',
        algo_version smallint NOT NULL,
        computed_at  timestamptz NOT NULL,
        PRIMARY KEY (place_id, activity, local_date)
      )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE activity_scores`);
    await q.query(`DROP TABLE weather_hourly`);
    await q.query(`DROP TABLE places`);
  }
}
