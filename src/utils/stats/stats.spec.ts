import { avg, max, min, sum } from './stats';

describe('stats', () => {
  it('ignores null and undefined', () => {
    const values = [1, null, 3, undefined, 5];
    expect(min(values)).toBe(1);
    expect(max(values)).toBe(5);
    expect(sum(values)).toBe(9);
    expect(avg(values)).toBe(3);
  });

  it('returns null when nothing is known, not zero', () => {
    for (const fn of [min, max, sum, avg]) {
      expect(fn([])).toBeNull();
      expect(fn([null, null])).toBeNull();
    }
  });

  it('keeps a real zero', () => {
    expect(sum([0, null])).toBe(0);
    expect(max([0])).toBe(0);
  });
});
