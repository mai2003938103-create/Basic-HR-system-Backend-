import request from 'supertest';
import { createApp } from '../../src/app.js';
import { fromDateString as day } from '../../src/models/mappers.js';
import { signAccessToken } from '../../src/utils/jwt.js';
import { prisma as db, resetDb } from '../helpers/db.js';
import { createEmployee, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

const typeId = async (code: string) => (await db.leaveType.findUniqueOrThrow({ where: { code } })).id;
const tok = (u: { user: { id: string } }) => signAccessToken({ sub: u.user.id });
const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith('hrms_rt='))?.split(';')[0];

describe('final review fixes', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T09:00:00+07:00'));
    await resetDb();
  });
  afterEach(() => vi.useRealTimers());

  it('lets an employee check in on a half-day leave', async () => {
    const mgr = await createUser({ role: 'manager' });
    const emp = await createUser({ role: 'employee', departmentId: mgr.employee!.departmentId });
    const r = await testApp().post('/api/leave-requests').set(auth(tok(emp)))
      .field('leaveTypeId', await typeId('PERSONAL')).field('startDate', '2026-11-04').field('endDate', '2026-11-04').field('halfDay', 'morning').field('reason', 'x');
    expect((await testApp().put(`/api/leave-requests/${r.body.data.id}/approve`).set(auth(tok(mgr))).send({})).status).toBe(200);
    vi.setSystemTime(new Date('2026-11-04T13:00:00+07:00'));
    const today = await testApp().get('/api/attendance/today').set(auth(tok(emp)));
    expect(today.body.data.onLeave).toBe(false);
    const ci = await testApp().post('/api/attendance/check-in').set(auth(tok(emp)));
    expect(ci.status).toBe(201);
  });

  it('does not let HR terminate a super admin through the employee status', async () => {
    const hr = await createUser({ role: 'hr_admin' });
    const sa = await createUser({ role: 'super_admin' });
    const res = await testApp().patch(`/api/employees/${sa.employee!.id}/status`).set(auth(tok(hr))).send({ status: 'terminated' });
    expect(res.status).toBe(403);
    expect((await testApp().get('/api/auth/me').set(auth(tok(sa)))).status).toBe(200);
  });

  it('keeps the last active super admin even for a super admin caller', async () => {
    await db.user.update({ where: { email: process.env.ADMIN_EMAIL! }, data: { isActive: false } });
    const sa = await createUser({ role: 'super_admin' });
    const other = await createUser({ role: 'super_admin', withEmployee: false });
    await db.user.update({ where: { id: other.user.id }, data: { isActive: false } });
    const res = await testApp().patch(`/api/employees/${sa.employee!.id}/status`).set(auth(tok(sa))).send({ status: 'terminated' });
    expect(res.status).toBe(409);
  });

  it('does not re-enable a disabled login on an unrelated status change', async () => {
    const hr = await createUser({ role: 'hr_admin' });
    const u = await createUser({ role: 'employee', employee: { employmentStatus: 'probation' } });
    await db.user.update({ where: { id: u.user.id }, data: { isActive: false } });
    await testApp().patch(`/api/employees/${u.employee!.id}/status`).set(auth(tok(hr))).send({ status: 'active' });
    const after = await db.user.findUniqueOrThrow({ where: { id: u.user.id } });
    expect(after.isActive).toBe(false);
  });

  it('refunds exactly what was charged even if holidays change before cancel', async () => {
    const mgr = await createUser({ role: 'manager' });
    const emp = await createUser({ role: 'employee', departmentId: mgr.employee!.departmentId });
    const r = await testApp().post('/api/leave-requests').set(auth(tok(emp)))
      .field('leaveTypeId', await typeId('ANNUAL')).field('startDate', '2026-11-16').field('endDate', '2026-11-20').field('reason', 'x');
    await testApp().put(`/api/leave-requests/${r.body.data.id}/approve`).set(auth(tok(mgr))).send({});
    await db.holiday.create({ data: { date: day('2026-11-18'), nameLo: 'x', nameEn: 'x' } });
    expect((await testApp().put(`/api/leave-requests/${r.body.data.id}/cancel`).set(auth(tok(emp)))).status).toBe(200);
    const b = (await db.leaveBalance.findFirst({ where: { employeeId: emp.employee!.id, year: 2026, leaveType: { code: 'ANNUAL' } } }))!;
    expect(Number(b.usedDays)).toBe(0);
  });

  it('lists assignable roles (incl. custom ones) for user managers without leaking role.manage roles', async () => {
    const hr = await createUser({ role: 'hr_admin' });
    const sa = await createUser({ role: 'super_admin', withEmployee: false });
    await testApp().post('/api/roles').set(auth(tok(sa))).send({ code: 'payroll_clerk', nameLo: 'ພະນັກງານເງິນເດືອນ', nameEn: 'Payroll clerk', scope: 'all', permissionCodes: ['employee.read'] });
    const forHr = await testApp().get('/api/roles/assignable').set(auth(tok(hr)));
    expect(forHr.status).toBe(200);
    const codes = forHr.body.data.map((r: any) => r.code);
    expect(codes).toContain('payroll_clerk');
    expect(codes).not.toContain('super_admin');
    const forSa = await testApp().get('/api/roles/assignable').set(auth(tok(sa)));
    expect(forSa.body.data.map((r: any) => r.code)).toContain('super_admin');
    const emp = await createUser({ role: 'employee' });
    expect((await testApp().get('/api/roles/assignable').set(auth(tok(emp)))).status).toBe(403);
  });

  it('ignores a spoofed X-Forwarded-For when rate limiting by default', async () => {
    vi.useRealTimers();
    const app = createApp();
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await request(app).post('/api/auth/login').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: 'x@test.la', password: 'Wrong1234' })).status;
    }
    expect(last).toBe(429);
  });

  it('survives two tabs refreshing with the same cookie at once', async () => {
    vi.useRealTimers();
    const { user, password } = await createUser({ role: 'employee' });
    const app = createApp();
    const c = cookieOf(await request(app).post('/api/auth/login').send({ email: user.email, password }))!;
    const [a, b] = await Promise.all([request(app).post('/api/auth/refresh').set('Cookie', c), request(app).post('/api/auth/refresh').set('Cookie', c)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    // both new cookies keep working
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(a)!)).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(b)!)).status).toBe(200);
  });

  it('matches Lao ຳ whichever way it was typed', async () => {
    const hr = await createUser({ role: 'hr_admin' });
    await createEmployee({ firstName: 'ຄຳແພງ', lastName: 'ສີຫາລາດ' });
    const res = await testApp().get(`/api/employees?search=${encodeURIComponent('ຄໍາແພງ')}`).set(auth(tok(hr)));
    expect(res.body.data.map((e: any) => e.firstName)).toEqual(['ຄຳແພງ']);
  });
});
