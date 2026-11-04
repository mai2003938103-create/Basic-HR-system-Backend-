import { and, asc, count, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import type { z } from 'zod';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';
import type { AuthContext } from '../../utils/auth-context.js';
import { audit } from '../../utils/audit.js';
import { TZ, localDate } from '../../utils/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { page, toPaging } from '../../utils/list-query.js';
import { canAccessEmployee, employeeScopeWhere } from '../../utils/scope.js';
import { isWorkingDay } from '../../utils/workdays.js';
import { getSettings, holidaySet } from '../settings/settings.service.js';
import { evaluateCheckIn, evaluateCheckOut } from './attendance.rules.js';
import { getPayrollConfig } from '../payroll/config.js';
import type { editAttendanceBody, exportAttendanceQuery, listAttendanceQuery } from './attendance.schema.js';

type Row = typeof s.attendance.$inferSelect;
const dto = (r: Row) => r;

async function workingDayInfo(date: string) {
  const st = await getSettings();
  return { st, working: isWorkingDay(date, st.workingDays, await holidaySet(date, date)) };
}

async function onApprovedLeave(employeeId: string, date: string) {
  const [row] = await db
    .select({ id: s.leaveRequests.id })
    .from(s.leaveRequests)
    // Only a full-day leave blocks check-in; on a half day the employee works the other half.
    .where(and(eq(s.leaveRequests.employeeId, employeeId), eq(s.leaveRequests.status, 'approved'), eq(s.leaveRequests.halfDay, 'none'), lte(s.leaveRequests.startDate, date), gte(s.leaveRequests.endDate, date)))
    .limit(1);
  return !!row;
}

const requireEmployee = (auth: AuthContext) => {
  if (!auth.employeeId) throw badRequest('errors.attendance.noEmployee');
  return auth.employeeId;
};

export async function today(auth: AuthContext) {
  const employeeId = requireEmployee(auth);
  const date = localDate(new Date());
  const [record] = await db.select().from(s.attendance).where(and(eq(s.attendance.employeeId, employeeId), eq(s.attendance.workDate, date)));
  const { working } = await workingDayInfo(date);
  return { date, isWorkingDay: working, onLeave: await onApprovedLeave(employeeId, date), record: record ? dto(record) : null };
}

export async function checkIn(auth: AuthContext, ip?: string) {
  const employeeId = requireEmployee(auth);
  const now = new Date();
  const date = localDate(now);
  const { st, working } = await workingDayInfo(date);
  if (await onApprovedLeave(employeeId, date)) throw conflict('errors.attendance.onLeave');
  const ev = evaluateCheckIn(now, st, working);
  const values = { employeeId, workDate: ev.workDate, checkInAt: now, status: ev.status, lateMinutes: ev.lateMinutes, checkInIp: ip ?? null };
  const [inserted] = await db.insert(s.attendance).values(values).onConflictDoNothing().returning();
  if (inserted) return dto(inserted);
  // A row already exists: only an absence placeholder without a check-in may be taken over.
  const [taken] = await db
    .update(s.attendance)
    .set({ checkInAt: now, status: ev.status, lateMinutes: ev.lateMinutes, checkInIp: ip ?? null })
    .where(and(eq(s.attendance.employeeId, employeeId), eq(s.attendance.workDate, date), isNull(s.attendance.checkInAt), eq(s.attendance.status, 'absent')))
    .returning();
  if (taken) return dto(taken);
  throw conflict('errors.attendance.alreadyCheckedIn');
}

export async function checkOut(auth: AuthContext) {
  const employeeId = requireEmployee(auth);
  const now = new Date();
  const date = localDate(now);
  const [rec] = await db.select().from(s.attendance).where(and(eq(s.attendance.employeeId, employeeId), eq(s.attendance.workDate, date)));
  if (!rec?.checkInAt) throw badRequest('errors.attendance.notCheckedIn');
  if (rec.checkOutAt) throw conflict('errors.attendance.alreadyCheckedOut');
  const { st, working } = await workingDayInfo(date);
  const ev = evaluateCheckOut(rec.checkInAt, now, st, rec.status === 'late' ? 'late' : 'present', working, (await getPayrollConfig()).overtime.thresholdMinutes);
  const [updated] = await db
    .update(s.attendance)
    .set({ checkOutAt: now, ...ev })
    .where(and(eq(s.attendance.id, rec.id), isNull(s.attendance.checkOutAt)))
    .returning();
  if (!updated) throw conflict('errors.attendance.alreadyCheckedOut');
  return dto(updated);
}

type Filters = Omit<z.infer<typeof exportAttendanceQuery>, 'lang'>;
function whereOf(auth: AuthContext, f: Filters) {
  const conds: (SQL | undefined)[] = [employeeScopeWhere(auth)];
  if (f.from) conds.push(gte(s.attendance.workDate, f.from));
  if (f.to) conds.push(lte(s.attendance.workDate, f.to));
  if (f.employeeId) conds.push(eq(s.attendance.employeeId, f.employeeId));
  if (f.departmentId) conds.push(eq(s.employees.departmentId, f.departmentId));
  if (f.status) conds.push(eq(s.attendance.status, f.status));
  return and(...conds);
}

const listSelect = {
  a: s.attendance,
  employee: { id: s.employees.id, employeeCode: s.employees.employeeCode, firstName: s.employees.firstName, lastName: s.employees.lastName, departmentId: s.employees.departmentId },
  department: { nameLo: s.departments.nameLo, nameEn: s.departments.nameEn },
};
const joined = () =>
  db.select(listSelect).from(s.attendance).innerJoin(s.employees, eq(s.employees.id, s.attendance.employeeId)).innerJoin(s.departments, eq(s.departments.id, s.employees.departmentId));

export async function list(auth: AuthContext, q: z.infer<typeof listAttendanceQuery>) {
  const where = whereOf(auth, q);
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const col = s.attendance[sortField as 'workDate'];
  const rows = await joined().where(where).orderBy(sortDir === 'asc' ? asc(col) : desc(col), asc(s.employees.employeeCode)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(s.attendance).innerJoin(s.employees, eq(s.employees.id, s.attendance.employeeId)).where(where);
  return page(rows.map((r) => ({ ...dto(r.a), employee: r.employee, department: r.department })), total, q);
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
  const rows = await joined().where(whereOf(auth, q)).orderBy(asc(s.attendance.workDate), asc(s.employees.employeeCode)).limit(20000);
  const time = (d: Date | null) => (d ? formatInTimeZone(d, TZ, 'HH:mm') : '');
  const lines = [HEADERS[q.lang].map(csvCell).join(',')];
  for (const r of rows) {
    const [y, m, d] = r.a.workDate.split('-');
    lines.push(
      [
        `${d}/${m}/${y}`, r.employee.employeeCode, `${r.employee.firstName} ${r.employee.lastName}`,
        q.lang === 'lo' ? r.department.nameLo : r.department.nameEn, time(r.a.checkInAt), time(r.a.checkOutAt),
        (r.a.workedMinutes / 60).toFixed(2), r.a.lateMinutes, r.a.earlyLeaveMinutes, STATUS_LABEL[q.lang][r.a.status], r.a.note ?? '',
      ].map(csvCell).join(','),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export async function edit(auth: AuthContext, id: string, body: z.infer<typeof editAttendanceBody>) {
  const [before] = await db
    .select({ a: s.attendance, departmentId: s.employees.departmentId })
    .from(s.attendance)
    .innerJoin(s.employees, eq(s.employees.id, s.attendance.employeeId))
    .where(eq(s.attendance.id, id));
  if (!before || !canAccessEmployee(auth, { id: before.a.employeeId, departmentId: before.departmentId })) throw notFound();
  if (auth.scope !== 'all') throw forbidden();
  const checkInAt = body.checkInAt === undefined ? before.a.checkInAt : body.checkInAt ? new Date(body.checkInAt) : null;
  const checkOutAt = body.checkOutAt === undefined ? before.a.checkOutAt : body.checkOutAt ? new Date(body.checkOutAt) : null;
  if (checkInAt && checkOutAt && checkOutAt <= checkInAt) throw badRequest('errors.attendance.invalidTimes', [{ field: 'checkOutAt', message: 'errors.attendance.invalidTimes' }]);
  const { st, working } = await workingDayInfo(before.a.workDate);
  let derived: Partial<Row> = {};
  if (checkInAt) {
    const ci = evaluateCheckIn(checkInAt, st, working);
    derived = { status: ci.status, lateMinutes: ci.lateMinutes, workedMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
    if (checkOutAt) derived = { ...derived, ...evaluateCheckOut(checkInAt, checkOutAt, st, ci.status, working, (await getPayrollConfig()).overtime.thresholdMinutes) };
  }
  const set = { checkInAt, checkOutAt, ...derived, ...(body.status ? { status: body.status } : {}), note: body.note };
  const [after] = await db.update(s.attendance).set(set).where(eq(s.attendance.id, id)).returning();
  await audit(db, auth, { action: 'attendance.edit', entity: 'attendance', entityId: id, before: before.a, after });
  return dto(after);
}
