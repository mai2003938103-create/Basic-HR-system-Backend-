import { leaveDaysByYear, totalLeaveDays } from '../../src/utils/workdays.js';

const WEEK = [1, 2, 3, 4, 5];
const none = new Set<string>();

describe('leave day maths', () => {
  it('counts a Monday–Friday week as 5', () => {
    expect(totalLeaveDays({ startDate: '2026-11-02', endDate: '2026-11-06', halfDay: 'none' }, WEEK, none)).toBe(5);
  });
  it('skips weekends', () => {
    expect(totalLeaveDays({ startDate: '2026-11-06', endDate: '2026-11-09', halfDay: 'none' }, WEEK, none)).toBe(2);
  });
  it('skips holidays', () => {
    expect(totalLeaveDays({ startDate: '2026-11-02', endDate: '2026-11-06', halfDay: 'none' }, WEEK, new Set(['2026-11-04']))).toBe(4);
  });
  it('counts a half day as 0.5', () => {
    expect(totalLeaveDays({ startDate: '2026-11-03', endDate: '2026-11-03', halfDay: 'morning' }, WEEK, none)).toBe(0.5);
  });
  it('refuses a half day spanning several days', () => {
    expect(() => totalLeaveDays({ startDate: '2026-11-03', endDate: '2026-11-04', halfDay: 'afternoon' }, WEEK, none)).toThrow();
  });
  it('returns 0 for a weekend-only range', () => {
    expect(totalLeaveDays({ startDate: '2026-11-07', endDate: '2026-11-08', halfDay: 'none' }, WEEK, none)).toBe(0);
  });
  it('splits days across a year boundary (Review Focus 2)', () => {
    const r = { startDate: '2026-12-30', endDate: '2027-01-02', halfDay: 'none' as const };
    expect(Object.fromEntries(leaveDaysByYear(r, WEEK, none))).toEqual({ 2026: 2, 2027: 1 });
    expect(Object.fromEntries(leaveDaysByYear(r, WEEK, new Set(['2027-01-01'])))).toEqual({ 2026: 2, 2027: 0 });
  });
});
