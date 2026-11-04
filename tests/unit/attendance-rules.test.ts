import { evaluateCheckIn, evaluateCheckOut } from '../../src/modules/attendance/attendance.rules.js';

const S = { workStart: '08:00', workEnd: '17:00', lateGraceMinutes: 15, halfDayMinutes: 240 };
// 08:10 Vientiane = 01:10 UTC
const at = (hhmm: string, date = '2026-11-03') => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h - 7, m));
};

describe('attendance rules', () => {
  it('is present within the grace period', () => {
    expect(evaluateCheckIn(at('08:10'), S)).toEqual({ workDate: '2026-11-03', status: 'present', lateMinutes: 0 });
  });
  it('is late after the grace period, counting from work start', () => {
    expect(evaluateCheckIn(at('08:16'), S)).toMatchObject({ status: 'late', lateMinutes: 16 });
  });
  it('is never late on a non-working day', () => {
    expect(evaluateCheckIn(at('10:00'), S, false)).toMatchObject({ status: 'present', lateMinutes: 0 });
  });
  it('uses the Vientiane date for an early check-in (Review Focus 1)', () => {
    expect(evaluateCheckIn(new Date('2026-11-02T23:30:00Z'), S).workDate).toBe('2026-11-03');
  });
  it('computes worked and early-leave minutes', () => {
    expect(evaluateCheckOut(at('08:00'), at('16:30'), S, 'present')).toEqual({ workedMinutes: 510, earlyLeaveMinutes: 30, status: 'present', overtimeMinutes: 0 });
  });
  it('keeps late status on a full day', () => {
    expect(evaluateCheckOut(at('08:20'), at('17:05'), S, 'late')).toEqual({ workedMinutes: 525, earlyLeaveMinutes: 0, status: 'late', overtimeMinutes: 0 });
  });
  it('marks a short day as half day', () => {
    expect(evaluateCheckOut(at('08:00'), at('11:00'), S, 'present').status).toBe('half_day');
  });

  it('counts overtime after work end beyond the threshold on a working day', () => {
    expect(evaluateCheckOut(at('08:00'), at('18:00'), S, 'present', true, 30).overtimeMinutes).toBe(30);
    expect(evaluateCheckOut(at('08:00'), at('17:20'), S, 'present', true, 30).overtimeMinutes).toBe(0);
  });
  it('counts every worked minute as overtime on a non-working day', () => {
    expect(evaluateCheckOut(at('09:00', '2026-11-07'), at('13:00', '2026-11-07'), S, 'present', false, 30).overtimeMinutes).toBe(240);
  });
});
