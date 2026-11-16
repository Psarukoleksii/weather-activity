export type CurvePoint = readonly [x: number, y: number];

/**
 * Builds f(x) from points sorted by x. Linear between points,
 * flat (clamped to the first/last y) outside of them.
 */
export function piecewiseLinear(points: readonly CurvePoint[]): (x: number) => number {
  if (points.length === 0) throw new Error('piecewiseLinear needs at least one point');
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] < points[i - 1][0]) throw new Error('piecewiseLinear points must be sorted by x');
  }
  return (x: number) => {
    if (x <= points[0][0]) return points[0][1];
    const last = points[points.length - 1];
    if (x >= last[0]) return last[1];
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i];
      if (x <= x1) {
        const [x0, y0] = points[i - 1];
        if (x1 === x0) return y1;
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return last[1];
  };
}
