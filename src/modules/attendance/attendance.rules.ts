import { localDate, localMinutes, parseHHmm } from '../../lib/dates.js';

export interface RuleSettings {
  workStart: string;
  workEnd: string;
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

export function evaluateCheckOut(checkInAt: Date, at: Date, s: RuleSettings, status: 'present' | 'late' | 'half_day', isWorkingDay = true) {
  const workedMinutes = Math.max(0, Math.floor((at.getTime() - checkInAt.getTime()) / 60000));
  const end = parseHHmm(s.workEnd);
  const sameDay = localDate(at) === localDate(checkInAt);
  const earlyLeaveMinutes = isWorkingDay && sameDay ? Math.max(0, end - localMinutes(at)) : 0;
  const base = status === 'half_day' ? 'present' : status;
  return {
    workedMinutes,
    earlyLeaveMinutes,
    status: (workedMinutes < s.halfDayMinutes ? 'half_day' : base) as 'present' | 'late' | 'half_day',
  };
}
