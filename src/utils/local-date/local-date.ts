const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface LocalParts {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 0..23 */
  hour: number;
}

/** Local calendar date and hour of a UTC instant in an IANA time zone. */
export function toLocalParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) parts[p.type] = p.value;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function localDateOf(instant: Date, timeZone: string): string {
  return toLocalParts(instant, timeZone).date;
}

/** Today's local date in the given time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localDateOf(now, timeZone);
}

/** Calendar arithmetic on 'YYYY-MM-DD' strings (time-zone independent). */
export function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days between two local dates: daysBetween('2026-11-16', '2026-11-18') = 2. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Groups items by local date. Order of dates and of items inside a date follows input order.
 * On DST transition days a group has 23 or 25 hours.
 */
export function groupByLocalDate<T>(
  items: readonly T[],
  instantOf: (item: T) => Date,
  timeZone: string,
): Map<string, Array<{ item: T; localHour: number }>> {
  const groups = new Map<string, Array<{ item: T; localHour: number }>>();
  for (const item of items) {
    const { date, hour } = toLocalParts(instantOf(item), timeZone);
    let g = groups.get(date);
    if (!g) groups.set(date, (g = []));
    g.push({ item, localHour: hour });
  }
  return groups;
}
