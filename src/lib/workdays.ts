import { addDays, isoWeekday, yearOf } from './dates.js';

export interface LeaveRange {
  startDate: string;
  endDate: string;
  halfDay: 'none' | 'morning' | 'afternoon';
}

export const isWorkingDay = (d: string, workingDays: number[], holidays: Set<string>) =>
  workingDays.includes(isoWeekday(d)) && !holidays.has(d);

/** Working dates (YYYY-MM-DD) inside the range. */
export function workingDates(r: Pick<LeaveRange, 'startDate' | 'endDate'>, workingDays: number[], holidays: Set<string>): string[] {
  const out: string[] = [];
  for (let d = r.startDate; d <= r.endDate; d = addDays(d, 1)) {
    if (isWorkingDay(d, workingDays, holidays)) out.push(d);
  }
  return out;
}

/** Leave days charged per calendar year (half day = 0.5, only when start = end). */
export function leaveDaysByYear(r: LeaveRange, workingDays: number[], holidays: Set<string>): Map<number, number> {
  if (r.endDate < r.startDate) throw new Error('end before start');
  if (r.halfDay !== 'none' && r.startDate !== r.endDate) throw new Error('half day must be a single date');
  const result = new Map<number, number>();
  for (let y = yearOf(r.startDate); y <= yearOf(r.endDate); y++) result.set(y, 0);
  for (const d of workingDates(r, workingDays, holidays)) {
    result.set(yearOf(d), (result.get(yearOf(d)) ?? 0) + (r.halfDay === 'none' ? 1 : 0.5));
  }
  return result;
}

export const totalLeaveDays = (r: LeaveRange, workingDays: number[], holidays: Set<string>) =>
  [...leaveDaysByYear(r, workingDays, holidays).values()].reduce((a, b) => a + b, 0);
