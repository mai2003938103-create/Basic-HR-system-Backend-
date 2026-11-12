// Read-only reports for HR, managers (own departments) and payroll (spec §6).
import type { Prisma } from '../generated/prisma/client.js';
import { fromDateString, toDateString } from '../models/mappers.js';
import { prisma } from '../models/prisma.js';
import type { AuthContext } from '../utils/auth-context.js';
import { localDate } from '../utils/dates.js';
import { employeeScopeWhere } from '../utils/scope.js';
import { workingDates } from '../utils/workdays.js';
import { periodBounds } from './payroll/inputs.js';
import { summaryView } from './payroll/runs.service.js';
import { getSettings, holidaySet } from './settings.service.js';

const round1 = (n: number) => Math.round(n * 10) / 10;
const today = () => localDate(new Date());
const brief = (e: { id: string; employeeCode: string; firstName: string; lastName: string }) => ({ id: e.id, employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName });

/** Employees visible to the caller, optionally narrowed to one department. */
function scoped(auth: AuthContext, departmentId?: string): Prisma.EmployeeWhereInput {
  const parts: Prisma.EmployeeWhereInput[] = [];
  const s = employeeScopeWhere(auth);
  if (s) parts.push(s);
  if (departmentId) parts.push({ departmentId });
  return parts.length ? { AND: parts } : {};
}

const lastMonths = (n: number, from = today().slice(0, 7)): string[] => {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    if (--m === 0) { m = 12; y--; }
  }
  return out;
};

// ---------- headcount ----------

export async function headcount(auth: AuthContext) {
  const [emps, depts] = await Promise.all([
    prisma.employee.findMany({ where: scoped(auth), select: { departmentId: true, gender: true, employmentStatus: true, hireDate: true, endDate: true } }),
    prisma.department.findMany({ select: { id: true, nameLo: true, nameEn: true }, orderBy: { code: 'asc' } }),
  ]);
  const current = emps.filter((e) => e.employmentStatus !== 'terminated');

  const byDepartment = depts
    .map((d) => {
      const rows = current.filter((e) => e.departmentId === d.id);
      return {
        departmentId: d.id, id: d.id, nameLo: d.nameLo, nameEn: d.nameEn,
        active: rows.filter((e) => e.employmentStatus === 'active').length,
        probation: rows.filter((e) => e.employmentStatus === 'probation').length,
        inactive: rows.filter((e) => e.employmentStatus === 'inactive').length,
        male: rows.filter((e) => e.gender === 'male').length,
        female: rows.filter((e) => e.gender === 'female').length,
        total: rows.length,
      };
    })
    .filter((d) => d.total > 0);

  const byGender = (['male', 'female', 'other'] as const).map((g) => ({ gender: g, count: current.filter((e) => e.gender === g).length }));

  const now = fromDateString(today()).getTime();
  const years = (hire: Date) => (now - hire.getTime()) / (365.25 * 86_400_000);
  const bucket = (y: number) => (y < 1 ? 'lt1' : y < 3 ? '1to3' : y < 5 ? '3to5' : 'gt5');
  const byTenure = ['lt1', '1to3', '3to5', 'gt5'].map((b) => ({ bucket: b, count: current.filter((e) => bucket(years(e.hireDate)) === b).length }));

  const monthOf = (d: Date | null) => (d ? toDateString(d)!.slice(0, 7) : '');
  const movement = lastMonths(12).map((month) => ({
    month,
    hires: emps.filter((e) => monthOf(e.hireDate) === month).length,
    exits: emps.filter((e) => monthOf(e.endDate) === month).length,
  }));

  return { total: current.length, byDepartment, byGender, byTenure, movement };
}

// ---------- attendance ----------

export async function attendance(auth: AuthContext, q: { month?: string; departmentId?: string }) {
  const month = q.month ?? today().slice(0, 7);
  const { start, end } = periodBounds(month);
  const st = await getSettings();
  const holidays = await holidaySet(start, end);
  // Only days that have happened count, so the rate does not drop at the start of a month.
  const upTo = today() < end ? today() : end;
  const workDays = upTo < start ? 0 : workingDates({ startDate: start, endDate: upTo }, st.workingDays, holidays).length;

  const emps = await prisma.employee.findMany({
    where: { AND: [scoped(auth, q.departmentId), { employmentStatus: { in: ['active', 'probation'] } }] },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { nameLo: true, nameEn: true } } },
    orderBy: { employeeCode: 'asc' },
  });
  const records = await prisma.attendance.findMany({
    where: { employeeId: { in: emps.map((e) => e.id) }, workDate: { gte: fromDateString(start), lte: fromDateString(end) } },
    select: { employeeId: true, status: true, lateMinutes: true, overtimeMinutes: true },
  });
  const byEmp = new Map<string, typeof records>();
  for (const r of records) byEmp.set(r.employeeId, [...(byEmp.get(r.employeeId) ?? []), r]);

  const rows = emps.map((e) => {
    const rs = byEmp.get(e.id) ?? [];
    const count = (s: string) => rs.filter((r) => r.status === s).length;
    const present = count('present');
    const late = count('late');
    const halfDay = count('half_day');
    const leave = count('leave');
    // Days without a record on a past working day count as absent only when the absence job has recorded them.
    const absent = count('absent');
    const expected = Math.max(0, workDays - leave);
    const rate = expected ? Math.min(100, round1(((present + late + halfDay * 0.5) / expected) * 100)) : 100;
    return {
      id: e.id, employee: brief(e), department: e.department, workDays, present, late, halfDay, absent, leave,
      lateMinutes: rs.reduce((s, r) => s + r.lateMinutes, 0), overtimeHours: round1(rs.reduce((s, r) => s + r.overtimeMinutes, 0) / 60), rate,
    };
  });
  return { month, workDays, rows };
}

// ---------- leave ----------

export async function leave(auth: AuthContext, q: { year?: number; departmentId?: string }) {
  const year = q.year ?? Number(today().slice(0, 4));
  const from = fromDateString(`${year}-01-01`);
  const to = fromDateString(`${year}-12-31`);
  const where = scoped(auth, q.departmentId);

  const [types, emps] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: { code: 'asc' } }),
    prisma.employee.findMany({
      where: { AND: [where, { employmentStatus: { in: ['active', 'probation'] } }] },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { nameLo: true, nameEn: true } },
        leaveBalances: { where: { year }, include: { leaveType: { select: { code: true } } } },
      },
      orderBy: { employeeCode: 'asc' },
    }),
  ]);
  const requests = await prisma.leaveRequest.findMany({
    where: { status: 'approved', startDate: { gte: from, lte: to }, employee: where },
    select: { leaveTypeId: true, startDate: true, days: true },
  });

  const byType = types.map((t) => {
    const rs = requests.filter((r) => r.leaveTypeId === t.id);
    return { leaveTypeId: t.id, id: t.id, code: t.code, nameLo: t.nameLo, nameEn: t.nameEn, days: round1(rs.reduce((s, r) => s + r.days.toNumber(), 0)), requests: rs.length };
  });
  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { month, days: round1(requests.filter((r) => toDateString(r.startDate)!.startsWith(month)).reduce((s, r) => s + r.days.toNumber(), 0)) };
  });
  const rows = emps.map((e) => ({
    id: e.id, employee: brief(e), department: e.department,
    balances: e.leaveBalances.map((b) => ({ code: b.leaveType.code, entitled: b.entitledDays.toNumber(), used: b.usedDays.toNumber() })),
  }));
  return { year, byType, byMonth, rows };
}

// ---------- payroll ----------

export async function payroll(q: { year?: number }) {
  const year = q.year ?? Number(today().slice(0, 4));
  const runs = await prisma.payRun.findMany({
    where: { period: { startsWith: `${year}-` } },
    orderBy: { period: 'asc' },
    include: { approvedBy: { select: { email: true } }, items: { select: { gross: true, net: true, incomeTax: true, ssEmployee: true, ssEmployer: true, employerCost: true } } },
  });
  const latest = [...runs].reverse().find((r) => r.status !== 'draft');
  const items = latest
    ? await prisma.payItem.findMany({ where: { payRunId: latest.id }, select: { gross: true, employerCost: true, employee: { select: { departmentId: true, department: { select: { nameLo: true, nameEn: true } } } } } })
    : [];
  const depts = new Map<string, { departmentId: string; id: string; nameLo: string; nameEn: string; headcount: number; gross: number; employerCost: number }>();
  for (const i of items) {
    const d = i.employee.departmentId;
    const cur = depts.get(d) ?? { departmentId: d, id: d, ...i.employee.department, headcount: 0, gross: 0, employerCost: 0 };
    cur.headcount += 1;
    cur.gross += i.gross.toNumber();
    cur.employerCost += i.employerCost.toNumber();
    depts.set(d, cur);
  }
  return {
    year,
    byMonth: runs.map(summaryView),
    byDepartment: [...depts.values()].sort((a, b) => b.employerCost - a.employerCost),
    latestPeriod: latest?.period ?? null,
  };
}

