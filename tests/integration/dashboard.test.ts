import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import * as s from '../../src/db/schema.js';
import { signAccessToken } from '../../src/lib/jwt.js';
import { resetDb } from '../helpers/db.js';
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
    await db.insert(s.attendance).values([
      { employeeId: mgr.employee!.id, workDate: TODAY, status: 'present', checkInAt: new Date() },
      { employeeId: a.id, workDate: TODAY, status: 'late', checkInAt: new Date() },
      { employeeId: c.id, workDate: TODAY, status: 'present', checkInAt: new Date() },
    ]);
    const [lt] = await db.select().from(s.leaveTypes).where(eq(s.leaveTypes.code, 'ANNUAL'));
    await db.insert(s.leaveRequests).values([
      { employeeId: b.id, leaveTypeId: lt.id, startDate: TODAY, endDate: TODAY, days: '1', reason: 'x', status: 'approved' },
      { employeeId: a.id, leaveTypeId: lt.id, startDate: '2026-11-20', endDate: '2026-11-20', days: '1', reason: 'x', status: 'pending' },
    ]);
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

  it('requires dashboard.view', async () => {
    const e = await createUser({ role: 'employee' });
    expect((await testApp().get('/api/dashboard/summary').set(auth(signAccessToken({ sub: e.user.id })))).status).toBe(403);
  });
});
