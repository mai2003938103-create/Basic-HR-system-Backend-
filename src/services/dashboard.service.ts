import type { Prisma } from '../generated/prisma/client.js';
import { fromDateString, toDateString } from '../models/mappers.js';
import { prisma } from '../models/prisma.js';
import type { AuthContext } from '../utils/auth-context.js';
import { addDays, localDate } from '../utils/dates.js';
import { employeeScopeWhere } from '../utils/scope.js';
import { isWorkingDay } from '../utils/workdays.js';
import { getSettings, holidaySet } from './settings.service.js';

const ACTIVE: Prisma.EmployeeWhereInput = { employmentStatus: { in: ['active', 'probation'] } };
const PRESENT = ['present', 'late', 'half_day'] as const;
const NONE: Prisma.LeaveRequestWhereInput = { id: { in: [] } };

const onLeaveOn = (d: Date): Prisma.LeaveRequestWhereInput => ({ status: 'approved', startDate: { lte: d }, endDate: { gte: d } });
const and = (...w: (Prisma.EmployeeWhereInput | undefined)[]): Prisma.EmployeeWhereInput => ({ AND: w.filter((x): x is Prisma.EmployeeWhereInput => !!x) });

export async function summary(auth: AuthContext) {
  const scope = employeeScopeWhere(auth);
  const today = localDate(new Date());
  const d = fromDateString(today);
  const st = await getSettings();
  const working = isWorkingDay(today, st.workingDays, await holidaySet(today, today));

  const [total, active] = await Promise.all([prisma.employee.count({ where: and(scope) }), prisma.employee.count({ where: and(scope, ACTIVE) })]);
  const departments =
    auth.scope === 'all' ? await prisma.department.count({ where: { isActive: true } }) : auth.scope === 'department' ? auth.managedDepartmentIds.length : 0;

  const attendanceToday = await prisma.attendance.groupBy({ by: ['status'], where: { workDate: d, ...(scope ? { employee: scope } : {}) }, _count: { _all: true } });
  const byAtt: Record<string, number> = Object.fromEntries(attendanceToday.map((r) => [r.status, r._count._all]));

  const onLeave = await prisma.employee.count({ where: and(scope, ACTIVE, { leaveRequests: { some: onLeaveOn(d) } }) });

  // Absent so far: explicit absent rows + (on working days) active staff with no record and no leave yet.
  const notCheckedIn = working
    ? await prisma.employee.count({ where: and(scope, ACTIVE, { hireDate: { lte: d }, attendance: { none: { workDate: d } }, leaveRequests: { none: onLeaveOn(d) } }) })
    : 0;

  return {
    totalEmployees: total,
    activeEmployees: active,
    inactiveEmployees: total - active,
    departments,
    presentToday: PRESENT.reduce((n, k) => n + (byAtt[k] ?? 0), 0),
    absentToday: (byAtt.absent ?? 0) + notCheckedIn,
    onLeaveToday: onLeave,
    pendingLeave: await pendingLeaveCount(auth),
  };
}

async function pendingLeaveCount(auth: AuthContext) {
  if (!auth.permissions.has('leave.approve')) {
    if (!auth.employeeId) return 0;
    return prisma.leaveRequest.count({ where: { status: 'pending', employeeId: auth.employeeId } });
  }
  const conds: Prisma.LeaveRequestWhereInput[] = [{ status: 'pending' }];
  if (auth.employeeId) conds.push({ employeeId: { not: auth.employeeId } });
  if (auth.scope !== 'all') conds.push(auth.employeeId ? { employee: { department: { managerId: auth.employeeId } } } : NONE);
  return prisma.leaveRequest.count({ where: { AND: conds } });
}

export async function charts(auth: AuthContext) {
  const scope = employeeScopeWhere(auth);
  const today = localDate(new Date());
  const from = addDays(today, -29);

  const byStatus = (await prisma.employee.groupBy({ by: ['employmentStatus'], where: and(scope), _count: { _all: true } })).map((r) => ({ status: r.employmentStatus, count: r._count._all }));

  const att = await prisma.attendance.groupBy({
    by: ['workDate', 'status'],
    where: { workDate: { gte: fromDateString(from), lte: fromDateString(today) }, ...(scope ? { employee: scope } : {}) },
    _count: { _all: true },
  });
  const attendance30d = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(from, i);
    const row = { date, present: 0, late: 0, half_day: 0, absent: 0, leave: 0 };
    for (const a of att) if (toDateString(a.workDate) === date) row[a.status] = a._count._all;
    return row;
  });

  const perDept = await prisma.employee.groupBy({ by: ['departmentId'], where: and(scope, ACTIVE), _count: { _all: true } });
  const names = new Map((await prisma.department.findMany({ where: { id: { in: perDept.map((p) => p.departmentId) } }, select: { id: true, nameLo: true, nameEn: true } })).map((x) => [x.id, x]));
  const byDepartment = perDept
    .map((p) => ({ departmentId: p.departmentId, nameLo: names.get(p.departmentId)!.nameLo, nameEn: names.get(p.departmentId)!.nameEn, count: p._count._all }))
    .sort((a, b) => b.count - a.count);

  const firstMonth = `${addMonths(today.slice(0, 7), -11)}-01`;
  const hires = await prisma.employee.findMany({ where: and(scope, { hireDate: { gte: fromDateString(firstMonth), lte: fromDateString(today) } }), select: { hireDate: true } });
  const perMonth = new Map<string, number>();
  for (const h of hires) {
    const m = toDateString(h.hireDate)!.slice(0, 7);
    perMonth.set(m, (perMonth.get(m) ?? 0) + 1);
  }
  const hiresByMonth = Array.from({ length: 12 }, (_, i) => {
    const month = addMonths(firstMonth.slice(0, 7), i);
    return { month, count: perMonth.get(month) ?? 0 };
  });

  return { byStatus, attendance30d, byDepartment, hiresByMonth };
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

const personSelect = {
  id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, department: { select: { nameLo: true, nameEn: true } },
} satisfies Prisma.EmployeeSelect;

/** Today's team in scope: who has not checked in, who came late, who is on leave (spec §6). Same rules as `summary`. */
export async function today(auth: AuthContext) {
  const scope = employeeScopeWhere(auth);
  const date = localDate(new Date());
  const d = fromDateString(date);
  const st = await getSettings();
  const working = isWorkingDay(date, st.workingDays, await holidaySet(date, date));
  const staff = and(scope, ACTIVE, { hireDate: { lte: d } });

  const [total, present, notCheckedIn, late, leave] = await Promise.all([
    prisma.employee.count({ where: staff }),
    prisma.attendance.count({ where: { workDate: d, status: { in: [...PRESENT] }, employee: staff } }),
    working
      ? prisma.employee.findMany({ where: and(staff, { attendance: { none: { workDate: d } }, leaveRequests: { none: onLeaveOn(d) } }), select: personSelect, orderBy: { employeeCode: 'asc' } })
      : Promise.resolve([]),
    prisma.attendance.findMany({
      where: { workDate: d, status: 'late', checkInAt: { not: null }, employee: staff },
      select: { checkInAt: true, lateMinutes: true, employee: { select: personSelect } },
      orderBy: { lateMinutes: 'desc' },
    }),
    prisma.leaveRequest.findMany({
      where: { ...onLeaveOn(d), employee: staff },
      select: { endDate: true, leaveType: { select: { nameLo: true, nameEn: true } }, employee: { select: personSelect } },
      orderBy: { endDate: 'asc' },
    }),
  ]);

  // One row per person even if two approved requests overlap today.
  const seen = new Set<string>();
  const onLeave = leave
    .filter((l) => !seen.has(l.employee.id) && seen.add(l.employee.id))
    .map((l) => ({ ...l.employee, leaveType: l.leaveType, endDate: toDateString(l.endDate)! }));

  return {
    date,
    isWorkingDay: working,
    workStart: st.workStart,
    present,
    total,
    notCheckedIn,
    late: late.map((a) => ({ ...a.employee, checkInAt: a.checkInAt!.toISOString(), lateMinutes: a.lateMinutes })),
    onLeave,
  };
}
