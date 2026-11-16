import { DayWeatherContext } from './day-weather.context';
import { makeContext, makeHours } from './testing/day-builder';

describe('DayWeatherContext', () => {
  it('takes the max snow depth of the day in cm and sums fresh snow', () => {
    const ctx = makeContext((h) => ({ snowDepthM: h < 6 ? 0.5 : 0.42, snowfallCm: h < 4 ? 2 : 0 }));
    expect(ctx.snowDepthCm).toBeCloseTo(50);
    expect(ctx.freshSnowCm).toBe(8);
  });

  it('aggregates daylight hours only', () => {
    const ctx = makeContext((h) => ({ windGustsKmh: h < 7 ? 90 : 20, temperatureC: h >= 7 && h < 17 ? 10 : -10 }));
    expect(ctx.daylightHours).toBe(10);
    expect(ctx.maxGustKmh).toBe(20);
    expect(ctx.maxGustAllDayKmh).toBe(90);
    expect(ctx.daylight.avgTemperatureC).toBe(10);
  });

  it('indoor window is 09:00–18:00 local time', () => {
    const ctx = makeContext();
    expect(ctx.indoorHours.hours.map((h) => h.localHour)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('falls back to fixed hours when is_day is unknown', () => {
    const ctx = makeContext({ isDay: null });
    expect(ctx.daylightHours).toBeNull();
    expect(ctx.daylight.count).toBe(10);
  });

  it('uses the indoor window during polar night', () => {
    const ctx = makeContext({ isDay: false });
    expect(ctx.daylightHours).toBe(0);
    expect(ctx.daylight).toBe(ctx.indoorHours);
  });

  it('detects thunderstorm in daylight, freezing rain and heavy snow over the whole day', () => {
    expect(makeContext((h) => ({ weatherCode: h === 12 ? 95 : 1 })).hasThunderstorm).toBe(true);
    expect(makeContext((h) => ({ weatherCode: h === 2 ? 95 : 1 })).hasThunderstorm).toBe(false);
    expect(makeContext((h) => ({ weatherCode: h === 2 ? 67 : 1 })).hasFreezingRain).toBe(true);
    expect(makeContext((h) => ({ snowfallCm: h < 10 ? 1.5 : 0 })).hasHeavySnow).toBe(true);
    expect(makeContext().hasHeavySnow).toBe(false);
  });

  it('keeps null as unknown', () => {
    const ctx = makeContext({ waveHeightM: null, snowDepthM: null });
    expect(ctx.avgWaveHeightM).toBeNull();
    expect(ctx.snowDepthCm).toBeNull();
  });

  it('sorts hours by time', () => {
    const hours = makeHours().reverse();
    const ctx = new DayWeatherContext({ localDate: '2026-11-16', daysAhead: 0, elevationM: 0, hasMarineData: false, hours });
    expect(ctx.allDay.hours[0].localHour).toBe(0);
  });
});
