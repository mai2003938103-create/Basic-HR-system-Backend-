import { and, count, eq, gte, inArray, lte, ne, notExists, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';
import type { AuthContext } from '../../lib/auth-context.js';
import { addDays, localDate } from '../../lib/dates.js';
import { employeeScopeWhere } from '../../lib/scope.js';
import { isWorkingDay } from '../../lib/workdays.js';
import { getSettings, holidaySet } from '../settings/settings.service.js';

const ACTIVE = ['active', 'probation'] as const;
const PRESENT = ['present', 'late', 'half_day'] as const;

const onLeaveOn = (date: string) =>
  and(eq(s.leaveRequests.employeeId, s.employees.id), eq(s.leaveRequests.status, 'approved'), lte(s.leaveRequests.startDate, date), gte(s.leaveRequests.endDate, date));

export async function summary(auth: AuthContext) {
  const scope = employeeScopeWhere(auth);
  const today = localDate(new Date());
  const st = await getSettings();
  const working = isWorkingDay(today, st.workingDays, await holidaySet(today, today));

  const [byStatus] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${inArray(s.employees.employmentStatus, [...ACTIVE])})::int`,
    })
    .from(s.employees)
    .where(scope);

  const [{ departments }] =
    auth.scope === 'all'
      ? await db.select({ departments: count() }).from(s.departments).where(eq(s.departments.isActive, true))
      : [{ departments: auth.scope === 'department' ? auth.managedDepartmentIds.length : 0 }];

  const attendanceToday = await db
    .select({ status: s.attendance.status, n: count() })
    .from(s.attendance)
    .innerJoin(s.employees, eq(s.employees.id, s.attendance.employeeId))
    .where(and(scope, eq(s.attendance.workDate, today)))
    .groupBy(s.attendance.status);
  const byAtt = Object.fromEntries(attendanceToday.map((r) => [r.status, r.n]));

  const [{ onLeave }] = await db
    .select({ onLeave: sql<number>`count(distinct ${s.employees.id})::int` })
    .from(s.employees)
    .innerJoin(s.leaveRequests, onLeaveOn(today))
    .where(and(scope, inArray(s.employees.employmentStatus, [...ACTIVE])));

  // Absent so far: explicit absent rows + (on working days) active staff with no record and no leave yet.
  let notCheckedIn = 0;
  if (working) {
    const [r] = await db
      .select({ n: count() })
      .from(s.employees)
      .where(
        and(
          scope,
          inArray(s.employees.employmentStatus, [...ACTIVE]),
          lte(s.employees.hireDate, today),
          notExists(db.select({ x: sql`1` }).from(s.attendance).where(and(eq(s.attendance.employeeId, s.employees.id), eq(s.attendance.workDate, today)))),
          notExists(db.select({ x: sql`1` }).from(s.leaveRequests).where(onLeaveOn(today))),
        ),
      );
    notCheckedIn = r.n;
  }

  return {
    totalEmployees: byStatus.total,
    activeEmployees: byStatus.active,
    inactiveEmployees: byStatus.total - byStatus.active,
    departments,
    presentToday: PRESENT.reduce((n, k) => n + (byAtt[k] ?? 0), 0),
    absentToday: (byAtt.absent ?? 0) + notCheckedIn,
    onLeaveToday: onLeave,
    pendingLeave: await pendingLeaveCount(auth),
  };
}

async function pendingLeaveCount(auth: AuthContext) {
  const base = db
    .select({ n: count() })
    .from(s.leaveRequests)
    .innerJoin(s.employees, eq(s.employees.id, s.leaveRequests.employeeId))
    .innerJoin(s.departments, eq(s.departments.id, s.employees.departmentId));
  if (!auth.permissions.has('leave.approve')) {
    if (!auth.employeeId) return 0;
    const [r] = await base.where(and(eq(s.leaveRequests.status, 'pending'), eq(s.leaveRequests.employeeId, auth.employeeId)));
    return r.n;
  }
  const conds = [eq(s.leaveRequests.status, 'pending'), auth.employeeId ? ne(s.leaveRequests.employeeId, auth.employeeId) : undefined];
  if (auth.scope !== 'all') conds.push(auth.employeeId ? eq(s.departments.managerId, auth.employeeId) : sql`false`);
  const [r] = await base.where(and(...conds));
  return r.n;
}

export async function charts(auth: AuthContext) {
  const scope = employeeScopeWhere(auth);
  const today = localDate(new Date());
  const from = addDays(today, -29);

  const byStatus = await db
    .select({ status: s.employees.employmentStatus, count: count() })
    .from(s.employees)
    .where(scope)
    .groupBy(s.employees.employmentStatus);

  const att = await db
    .select({ date: s.attendance.workDate, status: s.attendance.status, n: count() })
    .from(s.attendance)
    .innerJoin(s.employees, eq(s.employees.id, s.attendance.employeeId))
    .where(and(scope, gte(s.attendance.workDate, from), lte(s.attendance.workDate, today)))
    .groupBy(s.attendance.workDate, s.attendance.status);
  const attendance30d = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(from, i);
    const row = { date, present: 0, late: 0, half_day: 0, absent: 0, leave: 0 };
    for (const a of att) if (a.date === date) row[a.status] = a.n;
    return row;
  });

  const byDepartment = await db
    .select({ departmentId: s.departments.id, nameLo: s.departments.nameLo, nameEn: s.departments.nameEn, count: count() })
    .from(s.employees)
    .innerJoin(s.departments, eq(s.departments.id, s.employees.departmentId))
    .where(and(scope, inArray(s.employees.employmentStatus, [...ACTIVE])))
    .groupBy(s.departments.id, s.departments.nameLo, s.departments.nameEn)
    .orderBy(sql`count(*) desc`);

  const firstMonth = `${addMonths(today.slice(0, 7), -11)}-01`;
  const hires = await db
    .select({ month: sql<string>`to_char(${s.employees.hireDate}, 'YYYY-MM')`, n: count() })
    .from(s.employees)
    .where(and(scope, gte(s.employees.hireDate, firstMonth), lte(s.employees.hireDate, today)))
    .groupBy(sql`1`);
  const hiresByMonth = Array.from({ length: 12 }, (_, i) => {
    const month = addMonths(firstMonth.slice(0, 7), i);
    return { month, count: hires.find((h) => h.month === month)?.n ?? 0 };
  });

  return { byStatus, attendance30d, byDepartment, hiresByMonth };
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
