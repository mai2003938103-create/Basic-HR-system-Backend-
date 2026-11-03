import { formatInTimeZone } from 'date-fns-tz';

export const TZ = 'Asia/Vientiane';

/** Local calendar date (YYYY-MM-DD) of an instant in Asia/Vientiane. */
export const localDate = (at: Date): string => formatInTimeZone(at, TZ, 'yyyy-MM-dd');

/** Minutes since local midnight in Asia/Vientiane. */
export function localMinutes(at: Date): number {
  const [h, m] = formatInTimeZone(at, TZ, 'HH:mm').split(':').map(Number);
  return h * 60 + m;
}

/** UTC-midnight Date for a YYYY-MM-DD string (pure calendar arithmetic). */
export const dateOnly = (s: string): Date => new Date(`${s}T00:00:00Z`);

/** ISO weekday of a YYYY-MM-DD string: Monday = 1 … Sunday = 7. */
export function isoWeekday(s: string): number {
  const d = dateOnly(s).getUTCDay();
  return d === 0 ? 7 : d;
}

export function parseHHmm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export const addDays = (s: string, n: number): string => {
  const d = dateOnly(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const yearOf = (s: string): number => Number(s.slice(0, 4));
