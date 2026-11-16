import { piecewiseLinear } from './piecewise-linear';

describe('piecewiseLinear', () => {
  const f = piecewiseLinear([
    [0, 0],
    [10, 1],
    [20, 1],
    [30, 0],
  ]);

  it('interpolates between points', () => {
    expect(f(5)).toBeCloseTo(0.5);
    expect(f(25)).toBeCloseTo(0.5);
  });

  it('is flat inside the ideal range', () => {
    expect(f(10)).toBe(1);
    expect(f(15)).toBe(1);
    expect(f(20)).toBe(1);
  });

  it('clamps outside the points', () => {
    expect(f(-100)).toBe(0);
    expect(f(100)).toBe(0);
  });

  it('handles a single point and vertical steps', () => {
    expect(piecewiseLinear([[3, 0.4]])(10)).toBe(0.4);
    const step = piecewiseLinear([
      [0, 0],
      [5, 0],
      [5, 1],
      [10, 1],
    ]);
    expect(step(4.9)).toBe(0);
    expect(step(6)).toBe(1);
  });

  it('rejects unsorted points', () => {
    expect(() =>
      piecewiseLinear([
        [2, 0],
        [1, 1],
      ]),
    ).toThrow();
  });
});
