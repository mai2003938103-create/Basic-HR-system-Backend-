import { formatInTimeZone } from 'date-fns-tz';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import * as attendance from '../models/attendance.model.js';
import { fromDateString } from '../models/mappers.js';
import { prisma } from '../models/prisma.js';
import { getPayrollConfig } from './payroll/config.js';
import type { AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { TZ, localDate } from '../utils/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { page, sortBy, toPaging } from '../utils/list-query.js';
import { canAccessEmployee, employeeScopeWhere } from '../utils/scope.js';
import { isWorkingDay } from '../utils/workdays.js';
import type { editAttendanceBody, exportAttendanceQuery, listAttendanceQuery } from '../validators/attendance.validator.js';
import { attendanceListView } from '../views/attendance.view.js';
import { evaluateCheckIn, evaluateCheckOut } from './attendance.rules.js';
import { getSettings, holidaySet } from './settings.service.js';

async function workingDayInfo(date: string) {
  const st = await getSettings();
  return { st, working: isWorkingDay(date, st.workingDays, await holidaySet(date, date)) };
}

async function onApprovedLeave(employeeId: string, date: string) {
  const d = fromDateString(date);
  // Only a full-day leave blocks check-in; on a half day the employee works the other half.
  const row = await prisma.leaveRequest.findFirst({ where: { employeeId, status: 'approved', halfDay: 'none', startDate: { lte: d }, endDate: { gte: d } }, select: { id: true } });
  return !!row;
}

const requireEmployee = (auth: AuthContext) => {
  if (!auth.employeeId) throw badRequest('errors.attendance.noEmployee');
  return auth.employeeId;
};

const isDuplicate = (e: unknown) => (e as { code?: string })?.code === 'P2002';

export async function today(auth: AuthContext) {
  const employeeId = requireEmployee(auth);
  const date = localDate(new Date());
  const record = await attendance.findDay(employeeId, date);
  const { working } = await workingDayInfo(date);
  return { date, isWorkingDay: working, onLeave: await onApprovedLeave(employeeId, date), record };
}

export async function checkIn(auth: AuthContext, ip?: string) {
  const employeeId = requireEmployee(auth);
  const now = new Date();
  const date = localDate(now);
  const { st, working } = await workingDayInfo(date);
  if (await onApprovedLeave(employeeId, date)) throw conflict('errors.attendance.onLeave');
  const ev = evaluateCheckIn(now, st, working);
  try {
    return await attendance.create({ employeeId, workDate: ev.workDate, checkInAt: now, status: ev.status, lateMinutes: ev.lateMinutes, checkInIp: ip ?? null });
  } catch (e) {
    if (!isDuplicate(e)) throw e;
  }
  // A row already exists: only an absence placeholder without a check-in may be taken over.
  const taken = await attendance.updateWhere(
    { employeeId, workDate: fromDateString(date), checkInAt: null, status: 'absent' },
    { checkInAt: now, status: ev.status, lateMinutes: ev.lateMinutes, checkInIp: ip ?? null },
  );
  if (taken) return taken;
  throw conflict('errors.attendance.alreadyCheckedIn');
}

export async function checkOut(auth: AuthContext) {
  const employeeId = requireEmployee(auth);
  const now = new Date();
  const date = localDate(now);
  const rec = await attendance.findDay(employeeId, date);
  if (!rec?.checkInAt) throw badRequest('errors.attendance.notCheckedIn');
  if (rec.checkOutAt) throw conflict('errors.attendance.alreadyCheckedOut');
  const { st, working } = await workingDayInfo(date);
  const ev = evaluateCheckOut(rec.checkInAt, now, st, rec.status === 'late' ? 'late' : 'present', working, (await getPayrollConfig()).overtime.thresholdMinutes);
  const updated = await attendance.updateWhere({ id: rec.id, checkOutAt: null }, { checkOutAt: now, ...ev });
  if (!updated) throw conflict('errors.attendance.alreadyCheckedOut');
  return updated;
}

type Filters = Omit<z.infer<typeof exportAttendanceQuery>, 'lang'>;
function whereOf(auth: AuthContext, f: Filters): Prisma.AttendanceWhereInput {
  const emp: Prisma.EmployeeWhereInput[] = [];
  const scope = employeeScopeWhere(auth);
  if (scope) emp.push(scope);
  if (f.departmentId) emp.push({ departmentId: f.departmentId });
  return {
    ...(f.from || f.to ? { workDate: { ...(f.from ? { gte: fromDateString(f.from) } : {}), ...(f.to ? { lte: fromDateString(f.to) } : {}) } } : {}),
    ...(f.employeeId ? { employeeId: f.employeeId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(emp.length ? { employee: { AND: emp } } : {}),
  };
}

export async function list(auth: AuthContext, q: z.infer<typeof listAttendanceQuery>) {
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const { rows, total } = await attendance.list(whereOf(auth, q), [sortBy(sortField, sortDir, ['checkInAt']), { employee: { employeeCode: 'asc' } }], offset, limit);
  return page(rows.map(attendanceListView), total, q);
}

const HEADERS = {
  lo: ['ວັນທີ', 'ລະຫັດພະນັກງານ', 'ຊື່ ແລະ ນາມສະກຸນ', 'ພະແນກ', 'ເຂົ້າວຽກ', 'ເລີກວຽກ', 'ຊົ່ວໂມງເຮັດວຽກ', 'ມາຊ້າ (ນາທີ)', 'ອອກກ່ອນ (ນາທີ)', 'ສະຖານະ', 'ໝາຍເຫດ'],
  en: ['Date', 'Employee ID', 'Full name', 'Department', 'Check-in', 'Check-out', 'Hours worked', 'Late (min)', 'Early leave (min)', 'Status', 'Note'],
};
const STATUS_LABEL = {
  lo: { present: 'ມາເຮັດວຽກ', late: 'ມາຊ້າ', absent: 'ຂາດວຽກ', half_day: 'ເຄິ່ງວັນ', leave: 'ລາພັກ' },
  en: { present: 'Present', late: 'Late', absent: 'Absent', half_day: 'Half day', leave: 'Leave' },
};
function csvCell(v: unknown): string {
  let t = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(t)) t = `'${t}`; // stop spreadsheet formula injection
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export async function exportCsv(auth: AuthContext, q: z.infer<typeof exportAttendanceQuery>) {
  const { rows } = await attendance.list(whereOf(auth, q), [{ workDate: 'asc' }, { employee: { employeeCode: 'asc' } }], undefined, 20000);
  const time = (d: Date | null) => (d ? formatInTimeZone(d, TZ, 'HH:mm') : '');
  const lines = [HEADERS[q.lang].map(csvCell).join(',')];
  for (const r of rows.map(attendanceListView)) {
    const [y, m, d] = r.workDate.split('-');
    lines.push(
      [
        `${d}/${m}/${y}`, r.employee.employeeCode, `${r.employee.firstName} ${r.employee.lastName}`,
        q.lang === 'lo' ? r.department.nameLo : r.department.nameEn, time(r.checkInAt), time(r.checkOutAt),
        (r.workedMinutes / 60).toFixed(2), r.lateMinutes, r.earlyLeaveMinutes, STATUS_LABEL[q.lang][r.status], r.note ?? '',
      ].map(csvCell).join(','),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export async function edit(auth: AuthContext, id: string, body: z.infer<typeof editAttendanceBody>) {
  const found = await attendance.findById(id);
  if (!found || !canAccessEmployee(auth, { id: found.row.employeeId, departmentId: found.departmentId })) throw notFound();
  if (auth.scope !== 'all') throw forbidden();
  const before = found.row;
  const checkInAt = body.checkInAt === undefined ? before.checkInAt : body.checkInAt ? new Date(body.checkInAt) : null;
  const checkOutAt = body.checkOutAt === undefined ? before.checkOutAt : body.checkOutAt ? new Date(body.checkOutAt) : null;
  if (checkInAt && checkOutAt && checkOutAt <= checkInAt) throw badRequest('errors.attendance.invalidTimes', [{ field: 'checkOutAt', message: 'errors.attendance.invalidTimes' }]);
  const { st, working } = await workingDayInfo(before.workDate);
  let derived: Prisma.AttendanceUncheckedUpdateInput = {};
  if (checkInAt) {
    const ci = evaluateCheckIn(checkInAt, st, working);
    derived = { status: ci.status, lateMinutes: ci.lateMinutes, workedMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
    if (checkOutAt) derived = { ...derived, ...evaluateCheckOut(checkInAt, checkOutAt, st, ci.status, working, (await getPayrollConfig()).overtime.thresholdMinutes) };
  }
  const after = await attendance.update(id, { checkInAt, checkOutAt, ...derived, ...(body.status ? { status: body.status } : {}), note: body.note });
  await audit(prisma, auth, { action: 'attendance.edit', entity: 'attendance', entityId: id, before, after });
  return after;
}
