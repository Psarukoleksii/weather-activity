import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Place } from '../../models/place.entity';
import { groupByLocalDate } from '../../utils/local-date';
import { ActivityScoringService } from '../scoring/activity-scoring.service';
import { DayWeatherContext } from '../scoring/day-weather.context';
import {
  OpenMeteoClient,
  UpstreamUnavailableError,
  parseForecast,
  parseGeocoding,
  parseMarine,
} from './open-meteo.client';
import { WeatherService } from './weather.service';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, '../../../test/fixtures', name), 'utf8'));

describe('Open-Meteo parsing', () => {
  it('parses the first geocoding hit of the requested country', () => {
    expect(parseGeocoding(fixture('geocoding-zakopane.json'), 'pl')).toEqual({
      geonameId: '3080866',
      name: 'Zakopane',
      countryCode: 'PL',
      latitude: 49.29899,
      longitude: 19.94885,
      elevationM: 819,
      timezone: 'Europe/Warsaw',
    });
  });

  it('returns null when nothing is found or the country differs', () => {
    expect(parseGeocoding(fixture('geocoding-empty.json'), 'PL')).toBeNull();
    expect(parseGeocoding(fixture('geocoding-zakopane.json'), 'DE')).toBeNull();
  });

  it('parses 8 days of hourly forecast in UTC', () => {
    const body = fixture('forecast-zakopane.json');
    const hours = parseForecast(body);
    expect(hours).toHaveLength(192);
    expect(hours[0].validAt.toISOString()).toBe(new Date(body.hourly.time[0] * 1000).toISOString());
    expect(hours[1].validAt.getTime() - hours[0].validAt.getTime()).toBe(3_600_000);
    expect(hours[0]).toMatchObject({
      temperatureC: body.hourly.temperature_2m[0],
      windGustsKmh: body.hourly.wind_gusts_10m[0],
      snowDepthM: body.hourly.snow_depth[0],
      isDay: body.hourly.is_day[0] === 1,
    });
    expect(typeof hours[0].isDay).toBe('boolean');
  });

  it('keeps nulls as null and tolerates missing series', () => {
    const marine = parseMarine(fixture('marine-zakopane.json'));
    expect(marine).toHaveLength(192);
    expect(marine.every((h) => h.waveHeightM === null && h.seaSurfaceTemperatureC === null)).toBe(true);

    const partial = parseForecast({ hourly: { time: [1794783600], temperature_2m: [null] } });
    expect(partial[0]).toMatchObject({ temperatureC: null, snowDepthM: null, isDay: null });
  });

  it('parses marine data of a coastal place', () => {
    const body = fixture('marine-biarritz.json');
    const marine = parseMarine(body);
    expect(marine[0]).toMatchObject({
      waveHeightM: body.hourly.wave_height[0],
      swellWavePeriodS: body.hourly.swell_wave_period[0],
      seaSurfaceTemperatureC: body.hourly.sea_surface_temperature[0],
    });
  });

  it('recorded forecast scores into 8 local days of 4 activities', () => {
    const hours = parseForecast(fixture('forecast-zakopane.json'));
    const days = groupByLocalDate(hours, (h) => h.validAt, 'Europe/Warsaw');
    expect(days.size).toBe(8);
    const scoring = new ActivityScoringService({ skiMinElevationM: 300 });
    let i = 0;
    for (const [localDate, group] of days) {
      const ctx = new DayWeatherContext({
        localDate,
        daysAhead: i++,
        elevationM: 819,
        hasMarineData: false,
        hours: group.map(({ item, localHour }) => ({ ...item, ...NO_MARINE, localHour })),
      });
      const results = scoring.calculate(ctx);
      expect(results).toHaveLength(4);
      for (const r of results.filter((x) => x.applicable)) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      }
    }
  });
});

const NO_MARINE = {
  waveHeightM: null,
  wavePeriodS: null,
  swellWaveHeightM: null,
  swellWavePeriodS: null,
  seaSurfaceTemperatureC: null,
};

describe('OpenMeteoClient HTTP', () => {
  const config = { getOrThrow: () => 4 } as unknown as ConfigService;
  const client = new OpenMeteoClient(config as never);
  const realFetch = global.fetch;
  afterEach(() => (global.fetch = realFetch));

  it('wraps network errors and timeouts as UpstreamUnavailableError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(client.forecast(1, 2)).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('wraps non-2xx answers as UpstreamUnavailableError', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{"error":true}', { status: 502 }));
    await expect(client.geocode('Zakopane', 'PL')).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('requests the forecast with unixtime, 8 days and the expected variables', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify(fixture('forecast-zakopane.json'))));
    global.fetch = fetchMock;
    await client.forecast(49.3, 19.95);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('forecast_days')).toBe('8');
    expect(url.searchParams.get('hourly')).toContain('snow_depth');
  });
});

describe('WeatherService.fetchHourly', () => {
  const place = (hasMarineData: boolean | null) =>
    ({ id: '1', latitude: 1, longitude: 2, hasMarineData }) as Place;

  const clientWith = (forecastFile: string, marineFile: string) => ({
    forecast: jest.fn().mockResolvedValue(parseForecast(fixture(forecastFile))),
    marine: jest.fn().mockResolvedValue(parseMarine(fixture(marineFile))),
  });

  it('marks an inland place as having no marine data on the first check', async () => {
    const client = clientWith('forecast-zakopane.json', 'marine-zakopane.json');
    const result = await new WeatherService(client as never).fetchHourly(place(null));
    expect(result.hasMarineData).toBe(false);
    expect(result.hours).toHaveLength(192);
    expect(result.hours[0].waveHeightM).toBeNull();
  });

  it('merges marine data by timestamp for a coastal place', async () => {
    const client = clientWith('forecast-biarritz.json', 'marine-biarritz.json');
    const result = await new WeatherService(client as never).fetchHourly(place(null));
    expect(result.hasMarineData).toBe(true);
    expect(result.hours[0].waveHeightM).toBe(fixture('marine-biarritz.json').hourly.wave_height[0]);
    expect(result.hours[0].temperatureC).toBe(fixture('forecast-biarritz.json').hourly.temperature_2m[0]);
  });

  it('does not call the Marine API once a place is known to have no marine data', async () => {
    const client = clientWith('forecast-zakopane.json', 'marine-zakopane.json');
    const result = await new WeatherService(client as never).fetchHourly(place(false));
    expect(client.marine).not.toHaveBeenCalled();
    expect(result.hasMarineData).toBe(false);
  });
});
