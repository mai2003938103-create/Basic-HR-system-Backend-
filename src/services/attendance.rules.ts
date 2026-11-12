import { localDate, localMinutes, parseHHmm } from '../utils/dates.js';

export interface RuleSettings {
  workStart: string;
  workEnd: string;
  /** Lunch break (HH:mm); minutes inside it are not worked. Optional for callers that predate it. */
  breakStart?: string;
  breakEnd?: string;
  lateGraceMinutes: number;
  halfDayMinutes: number;
}

export function evaluateCheckIn(at: Date, s: RuleSettings, isWorkingDay = true) {
  const workDate = localDate(at);
  const minutes = localMinutes(at);
  const start = parseHHmm(s.workStart);
  const late = isWorkingDay && minutes > start + s.lateGraceMinutes;
  return { workDate, status: (late ? 'late' : 'present') as 'present' | 'late', lateMinutes: late ? minutes - start : 0 };
}

/** Minutes of the lunch break that fall between check-in and check-out (same local day). */
export function breakOverlap(fromMinutes: number, toMinutes: number, s: Pick<RuleSettings, 'breakStart' | 'breakEnd'>): number {
  if (!s.breakStart || !s.breakEnd) return 0;
  const bs = parseHHmm(s.breakStart);
  const be = parseHHmm(s.breakEnd);
  return Math.max(0, Math.min(toMinutes, be) - Math.max(fromMinutes, bs));
}

export function evaluateCheckOut(checkInAt: Date, at: Date, s: RuleSettings, status: 'present' | 'late' | 'half_day', isWorkingDay = true, thresholdMinutes = 30) {
  const end = parseHHmm(s.workEnd);
  const sameDay = localDate(at) === localDate(checkInAt);
  const elapsed = Math.max(0, Math.floor((at.getTime() - checkInAt.getTime()) / 60000));
  const workedMinutes = Math.max(0, elapsed - (sameDay ? breakOverlap(localMinutes(checkInAt), localMinutes(at), s) : 0));
  const earlyLeaveMinutes = isWorkingDay && sameDay ? Math.max(0, end - localMinutes(at)) : 0;
  const base = status === 'half_day' ? 'present' : status;
  // Working day: minutes after work end beyond the threshold. Rest day or holiday: every minute worked.
  const afterEnd = sameDay ? localMinutes(at) - end : workedMinutes;
  const overtimeMinutes = isWorkingDay ? Math.max(0, afterEnd - thresholdMinutes) : workedMinutes;
  return {
    workedMinutes,
    earlyLeaveMinutes,
    status: (workedMinutes < s.halfDayMinutes ? 'half_day' : base) as 'present' | 'late' | 'half_day',
    overtimeMinutes,
  };
}
