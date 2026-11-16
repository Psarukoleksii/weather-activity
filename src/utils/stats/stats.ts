type Maybe = number | null | undefined;

function known(values: readonly Maybe[]): number[] {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/** null when there is no known value: "unknown" is not zero. */
export function min(values: readonly Maybe[]): number | null {
  const k = known(values);
  return k.length ? Math.min(...k) : null;
}

export function max(values: readonly Maybe[]): number | null {
  const k = known(values);
  return k.length ? Math.max(...k) : null;
}

export function sum(values: readonly Maybe[]): number | null {
  const k = known(values);
  return k.length ? k.reduce((a, b) => a + b, 0) : null;
}

export function avg(values: readonly Maybe[]): number | null {
  const k = known(values);
  return k.length ? k.reduce((a, b) => a + b, 0) / k.length : null;
}
