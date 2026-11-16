import { addDays, daysBetween, groupByLocalDate, localDateOf, toLocalParts, todayIn } from './local-date';

const hourly = (startIso: string, count: number) =>
  Array.from({ length: count }, (_, i) => new Date(Date.parse(startIso) + i * 3_600_000));

describe('local-date', () => {
  it('converts a UTC instant to the local date and hour', () => {
    const instant = new Date('2026-11-16T23:30:00Z');
    expect(toLocalParts(instant, 'Europe/Warsaw')).toEqual({ date: '2026-11-17', hour: 0 });
    expect(toLocalParts(instant, 'America/New_York')).toEqual({ date: '2026-11-16', hour: 18 });
    expect(localDateOf(instant, 'UTC')).toBe('2026-11-16');
  });

  it('today depends on the time zone', () => {
    const now = new Date('2026-11-16T23:30:00Z');
    expect(todayIn('Asia/Tokyo', now)).toBe('2026-11-17');
    expect(todayIn('Pacific/Honolulu', now)).toBe('2026-11-16');
  });

  it('does calendar arithmetic across months and years', () => {
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-16', '2026-11-23')).toBe(7);
    expect(daysBetween('2026-11-16', '2026-11-15')).toBe(-1);
  });

  it('groups hours into local days', () => {
    // Local midnight of 2026-11-16 in Warsaw is 23:00Z the day before.
    const groups = groupByLocalDate(hourly('2026-11-15T23:00:00Z', 48), (d) => d, 'Europe/Warsaw');
    expect([...groups.keys()]).toEqual(['2026-11-16', '2026-11-17']);
    expect(groups.get('2026-11-16')!.map((h) => h.localHour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('spring-forward day has 23 hours', () => {
    // 2026-03-29 local midnight in Warsaw (CET, UTC+1) = 2026-03-28T23:00Z
    const groups = groupByLocalDate(hourly('2026-03-28T23:00:00Z', 47), (d) => d, 'Europe/Warsaw');
    const day = groups.get('2026-03-29')!;
    expect(day).toHaveLength(23);
    expect(day.map((h) => h.localHour)).not.toContain(2);
  });

  it('fall-back day has 25 hours', () => {
    // 2026-10-25 local midnight in Warsaw (CEST, UTC+2) = 2026-10-24T22:00Z
    const groups = groupByLocalDate(hourly('2026-10-24T22:00:00Z', 49), (d) => d, 'Europe/Warsaw');
    const day = groups.get('2026-10-25')!;
    expect(day).toHaveLength(25);
    expect(day.filter((h) => h.localHour === 2)).toHaveLength(2);
  });
});
