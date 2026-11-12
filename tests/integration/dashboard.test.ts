import { fromDateString as day } from '../../src/models/mappers.js';
import { signAccessToken } from '../../src/utils/jwt.js';
import { prisma as db, resetDb } from '../helpers/db.js';
import { createDepartment, createEmployee, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

const TODAY = '2026-11-03';

describe('dashboard', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T10:00:00+07:00`));
    await resetDb();
  });
  afterEach(() => vi.useRealTimers());

  async function fixture() {
    const d1 = await createDepartment();
    const d2 = await createDepartment();
    const mgr = await createUser({ role: 'manager', departmentId: d1.id });
    const hr = await createUser({ role: 'hr_admin', departmentId: d2.id });
    const a = await createEmployee({ departmentId: d1.id, hireDate: '2026-10-05' });
    const b = await createEmployee({ departmentId: d1.id });
    await createEmployee({ departmentId: d1.id, employmentStatus: 'inactive' });
    const c = await createEmployee({ departmentId: d2.id });
    await db.attendance.createMany({
      data: [
        { employeeId: mgr.employee!.id, workDate: day(TODAY), status: 'present', checkInAt: new Date() },
        { employeeId: a.id, workDate: day(TODAY), status: 'late', checkInAt: new Date() },
        { employeeId: c.id, workDate: day(TODAY), status: 'present', checkInAt: new Date() },
      ],
    });
    const lt = await db.leaveType.findUniqueOrThrow({ where: { code: 'ANNUAL' } });
    await db.leaveRequest.createMany({
      data: [
        { employeeId: b.id, leaveTypeId: lt.id, startDate: day(TODAY), endDate: day(TODAY), days: '1', reason: 'x', status: 'approved' },
        { employeeId: a.id, leaveTypeId: lt.id, startDate: day('2026-11-20'), endDate: day('2026-11-20'), days: '1', reason: 'x', status: 'pending' },
      ],
    });
    return { mgr, hr };
  }

  it('summarises the whole company for HR', async () => {
    const { hr } = await fixture();
    const res = await testApp().get('/api/dashboard/summary').set(auth(signAccessToken({ sub: hr.user.id })));
    expect(res.status).toBe(200);
    // employees: mgr, hr, a, b, inactive, c = 6 (5 active)
    expect(res.body.data).toEqual({
      totalEmployees: 6, activeEmployees: 5, inactiveEmployees: 1, departments: 2,
      presentToday: 3, absentToday: 1, onLeaveToday: 1, pendingLeave: 1,
    });
  });

  it('limits a manager to their department', async () => {
    const { mgr } = await fixture();
    const res = await testApp().get('/api/dashboard/summary').set(auth(signAccessToken({ sub: mgr.user.id })));
    // d1: mgr, a, b, inactive
    expect(res.body.data).toMatchObject({ totalEmployees: 4, activeEmployees: 3, inactiveEmployees: 1, departments: 1, presentToday: 2, absentToday: 0, onLeaveToday: 1, pendingLeave: 1 });
  });

  it('returns chart series', async () => {
    const { hr } = await fixture();
    const res = await testApp().get('/api/dashboard/charts').set(auth(signAccessToken({ sub: hr.user.id })));
    expect(res.body.data.attendance30d).toHaveLength(30);
    expect(res.body.data.attendance30d.at(-1)).toMatchObject({ date: TODAY, present: 2, late: 1 });
    expect(res.body.data.byDepartment.reduce((n: number, d: any) => n + d.count, 0)).toBe(5);
    expect(res.body.data.hiresByMonth).toHaveLength(12);
    expect(res.body.data.hiresByMonth.find((m: any) => m.month === '2026-10').count).toBe(1);
    expect(res.body.data.byStatus.find((x: any) => x.status === 'inactive').count).toBe(1);
  });

  it("lists today's team for HR: not checked in, late and on leave", async () => {
    const { hr } = await fixture();
    const res = await testApp().get('/api/dashboard/today').set(auth(signAccessToken({ sub: hr.user.id })));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ date: TODAY, isWorkingDay: true, present: 3, total: 5 });
    expect(d.notCheckedIn.map((p: any) => p.id)).toEqual([hr.employee!.id]);
    expect(d.late).toHaveLength(1);
    expect(d.late[0]).toMatchObject({ checkInAt: expect.any(String), department: expect.objectContaining({ nameLo: expect.any(String) }) });
    expect(d.onLeave).toHaveLength(1);
    expect(d.onLeave[0]).toMatchObject({ endDate: TODAY, leaveType: { nameEn: 'Annual Leave' } });
  });

  it("limits today's team to a manager's department and refuses employees", async () => {
    const { mgr } = await fixture();
    const d = (await testApp().get('/api/dashboard/today').set(auth(signAccessToken({ sub: mgr.user.id })))).body.data;
    expect(d).toMatchObject({ present: 2, total: 3, notCheckedIn: [] });
    expect(d.late).toHaveLength(1);
    expect(d.onLeave).toHaveLength(1);
    const e = await createUser({ role: 'employee' });
    expect((await testApp().get('/api/dashboard/today').set(auth(e.token))).status).toBe(403);
  });

  it('requires dashboard.view', async () => {
    const e = await createUser({ role: 'employee' });
    expect((await testApp().get('/api/dashboard/summary').set(auth(signAccessToken({ sub: e.user.id })))).status).toBe(403);
  });
});
