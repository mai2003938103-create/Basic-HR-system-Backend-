// Builds each employee's payroll inputs for a period from employees, allowances, attendance and leave (spec §5.1).
import { fromDateString, toDateString } from '../../models/mappers.js';
import type { Db } from '../../models/prisma.js';
import { addDays } from '../../utils/dates.js';
import { isWorkingDay, workingDates } from '../../utils/workdays.js';
import { getSettings, holidaySet } from '../settings.service.js';
import type { PayInput } from './calc.js';
import { getPayrollConfig } from './config.js';

export type PeriodInput = Omit<PayInput, 'bonus' | 'otherDeduction'>;

export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number);
  const start = `${period}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end: addDays(next, -1) };
}

export async function buildInputs(tx: Db, period: string, employeeIds?: string[]): Promise<Map<string, PeriodInput>> {
  const { start, end } = periodBounds(period);
  const [st, cfg, holidays] = await Promise.all([getSettings(), getPayrollConfig(), holidaySet(start, end)]);
  const periodDates = workingDates({ startDate: start, endDate: end }, st.workingDays, holidays);
  const S = fromDateString(start);
  const E = fromDateString(end);

  const emps = await tx.employee.findMany({
    where: {
      hireDate: { lte: E },
      OR: [{ employmentStatus: { in: ['active', 'probation'] } }, { employmentStatus: 'terminated', endDate: { gte: S } }],
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: S } }] }],
      ...(employeeIds ? { id: { in: employeeIds } } : {}),
    },
  });
  const out = new Map<string, PeriodInput>();
  if (!emps.length) return out;
  const ids = emps.map((e) => e.id);

  const [allowanceRows, attendanceRows, unpaidRows] = await Promise.all([
    tx.employeeAllowance.findMany({ where: { employeeId: { in: ids }, type: { isActive: true } }, include: { type: true } }),
    tx.attendance.findMany({ where: { employeeId: { in: ids }, workDate: { gte: S, lte: E } }, select: { employeeId: true, workDate: true, overtimeMinutes: true } }),
    tx.leaveRequest.findMany({
      where: { employeeId: { in: ids }, status: 'approved', leaveType: { isPaid: false }, startDate: { lte: E }, endDate: { gte: S } },
      select: { employeeId: true, startDate: true, endDate: true, halfDay: true },
    }),
  ]);

  for (const e of emps) {
    const hire = toDateString(e.hireDate)!;
    const endDate = toDateString(e.endDate);
    const from = hire > start ? hire : start;
    const to = endDate && endDate < end ? endDate : end;
    const paidWorkDays = periodDates.filter((d) => d >= from && d <= to).length;

    let weekday = 0;
    let restday = 0;
    for (const a of attendanceRows) {
      if (a.employeeId !== e.id || !a.overtimeMinutes) continue;
      if (isWorkingDay(toDateString(a.workDate)!, st.workingDays, holidays)) weekday += a.overtimeMinutes;
      else restday += a.overtimeMinutes;
    }
    // Cap the month: weekday minutes first, then rest-day minutes.
    const cap = cfg.overtime.maxMinutesPerMonth;
    weekday = Math.min(weekday, cap);
    restday = Math.min(restday, cap - weekday);

    let unpaidDays = 0;
    for (const l of unpaidRows) {
      if (l.employeeId !== e.id) continue;
      const ls = toDateString(l.startDate)!;
      const le = toDateString(l.endDate)!;
      const days = workingDates({ startDate: ls < start ? start : ls, endDate: le > end ? end : le }, st.workingDays, holidays).length;
      unpaidDays += l.halfDay !== 'none' ? days * 0.5 : days;
    }

    out.set(e.id, {
      basic: Math.round(e.basicSalary.toNumber()),
      periodWorkDays: periodDates.length,
      paidWorkDays,
      allowances: allowanceRows
        .filter((a) => a.employeeId === e.id && a.amount.toNumber() > 0)
        .map((a) => ({ typeId: a.type.id, code: a.type.code, nameLo: a.type.nameLo, nameEn: a.type.nameEn, amount: a.amount.toNumber(), taxable: a.type.taxable })),
      overtimeMinutesWeekday: weekday,
      overtimeMinutesRestday: restday,
      unpaidDays,
    });
  }
  return out;
}
