// Builds each employee's payroll inputs for a period from employees, allowances, attendance and leave (spec §5.1).
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import * as s from '../../db/schema.js';
import { addDays } from '../../lib/dates.js';
import { isWorkingDay, workingDates } from '../../lib/workdays.js';
import { getSettings, holidaySet } from '../settings/settings.service.js';
import type { PayInput } from './calc.js';
import { getPayrollConfig } from './config.js';

export type PeriodInput = Omit<PayInput, 'bonus' | 'otherDeduction'>;

export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number);
  const start = `${period}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end: addDays(next, -1) };
}

export async function buildInputs(tx: DbOrTx, period: string, employeeIds?: string[]): Promise<Map<string, PeriodInput>> {
  const { start, end } = periodBounds(period);
  const [st, cfg, holidays] = await Promise.all([getSettings(), getPayrollConfig(), holidaySet(start, end)]);
  const periodDates = workingDates({ startDate: start, endDate: end }, st.workingDays, holidays);

  const emps = await tx
    .select()
    .from(s.employees)
    .where(
      and(
        lte(s.employees.hireDate, end),
        or(inArray(s.employees.employmentStatus, ['active', 'probation']), and(eq(s.employees.employmentStatus, 'terminated'), gte(s.employees.endDate, start))),
        or(isNull(s.employees.endDate), gte(s.employees.endDate, start)),
        employeeIds ? inArray(s.employees.id, employeeIds) : undefined,
      ),
    );
  const out = new Map<string, PeriodInput>();
  if (!emps.length) return out;
  const ids = emps.map((e) => e.id);

  const allowanceRows = await tx
    .select({ employeeId: s.employeeAllowances.employeeId, amount: s.employeeAllowances.amount, t: s.allowanceTypes })
    .from(s.employeeAllowances)
    .innerJoin(s.allowanceTypes, eq(s.allowanceTypes.id, s.employeeAllowances.allowanceTypeId))
    .where(and(inArray(s.employeeAllowances.employeeId, ids), eq(s.allowanceTypes.isActive, true)));

  const attendanceRows = await tx
    .select({ employeeId: s.attendance.employeeId, workDate: s.attendance.workDate, overtimeMinutes: s.attendance.overtimeMinutes })
    .from(s.attendance)
    .where(and(inArray(s.attendance.employeeId, ids), gte(s.attendance.workDate, start), lte(s.attendance.workDate, end)));

  const unpaidRows = await tx
    .select({ employeeId: s.leaveRequests.employeeId, startDate: s.leaveRequests.startDate, endDate: s.leaveRequests.endDate, halfDay: s.leaveRequests.halfDay })
    .from(s.leaveRequests)
    .innerJoin(s.leaveTypes, eq(s.leaveTypes.id, s.leaveRequests.leaveTypeId))
    .where(and(inArray(s.leaveRequests.employeeId, ids), eq(s.leaveRequests.status, 'approved'), eq(s.leaveTypes.isPaid, false), lte(s.leaveRequests.startDate, end), gte(s.leaveRequests.endDate, start)));

  for (const e of emps) {
    const from = e.hireDate > start ? e.hireDate : start;
    const to = e.endDate && e.endDate < end ? e.endDate : end;
    const paidWorkDays = periodDates.filter((d) => d >= from && d <= to).length;

    let weekday = 0;
    let restday = 0;
    for (const a of attendanceRows) {
      if (a.employeeId !== e.id || !a.overtimeMinutes) continue;
      if (isWorkingDay(a.workDate, st.workingDays, holidays)) weekday += a.overtimeMinutes;
      else restday += a.overtimeMinutes;
    }
    // Cap the month: weekday minutes first, then rest-day minutes.
    const cap = cfg.overtime.maxMinutesPerMonth;
    weekday = Math.min(weekday, cap);
    restday = Math.min(restday, cap - weekday);

    let unpaidDays = 0;
    for (const l of unpaidRows) {
      if (l.employeeId !== e.id) continue;
      const days = workingDates({ startDate: l.startDate < start ? start : l.startDate, endDate: l.endDate > end ? end : l.endDate }, st.workingDays, holidays).length;
      unpaidDays += l.halfDay !== 'none' ? days * 0.5 : days;
    }

    out.set(e.id, {
      basic: Math.round(Number(e.basicSalary)),
      periodWorkDays: periodDates.length,
      paidWorkDays,
      allowances: allowanceRows
        .filter((a) => a.employeeId === e.id && a.amount > 0)
        .map((a) => ({ typeId: a.t.id, code: a.t.code, nameLo: a.t.nameLo, nameEn: a.t.nameEn, amount: a.amount, taxable: a.t.taxable })),
      overtimeMinutesWeekday: weekday,
      overtimeMinutesRestday: restday,
      unpaidDays,
    });
  }
  return out;
}
