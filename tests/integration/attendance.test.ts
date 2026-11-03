import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import * as s from '../../src/db/schema.js';
import { markAbsences } from '../../src/jobs/mark-absences.js';
import { resetDb } from '../helpers/db.js';
import { createEmployee, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';
import { signAccessToken } from '../../src/lib/jwt.js';

// Tuesday 03/11/2026, Vientiane = UTC+7
const local = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`);
const setNow = (d: Date) => vi.setSystemTime(d);

describe('attendance', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await resetDb();
  });
  afterEach(() => vi.useRealTimers());

  it('checks in and out and reflects it on /today', async () => {
    const { user } = await createUser({ role: 'employee' });
    setNow(local('2026-11-03', '08:20'));
    let token = signAccessToken({ sub: user.id });
    expect((await testApp().get('/api/attendance/today').set(auth(token))).body.data.record).toBeNull();
    const ci = await testApp().post('/api/attendance/check-in').set(auth(token));
    expect(ci.status).toBe(201);
    expect(ci.body.data).toMatchObject({ workDate: '2026-11-03', status: 'late', lateMinutes: 20 });
    setNow(local('2026-11-03', '17:10'));
    token = signAccessToken({ sub: user.id }); // access tokens live 15 minutes
    const co = await testApp().post('/api/attendance/check-out').set(auth(token));
    expect(co.status).toBe(200);
    expect(co.body.data).toMatchObject({ status: 'late', workedMinutes: 530, earlyLeaveMinutes: 0 });
    const today = await testApp().get('/api/attendance/today').set(auth(token));
    expect(today.body.data.record.checkOutAt).toBeTruthy();
  });

  it('rejects a second check-in and a check-out without check-in', async () => {
    const { token } = await createUser({ role: 'employee' });
    setNow(local('2026-11-03', '08:00'));
    expect((await testApp().post('/api/attendance/check-out').set(auth(token))).status).toBe(400);
    await testApp().post('/api/attendance/check-in').set(auth(token));
    const again = await testApp().post('/api/attendance/check-in').set(auth(token));
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe('errors.attendance.alreadyCheckedIn');
    await testApp().post('/api/attendance/check-out').set(auth(token));
    expect((await testApp().post('/api/attendance/check-out').set(auth(token))).status).toBe(409);
  });

  it('handles two simultaneous check-ins safely (Review Focus 4)', async () => {
    const { token, employee } = await createUser({ role: 'employee' });
    setNow(local('2026-11-03', '07:55'));
    const res = await Promise.all([testApp().post('/api/attendance/check-in').set(auth(token)), testApp().post('/api/attendance/check-in').set(auth(token))]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.$count(s.attendance, eq(s.attendance.employeeId, employee!.id))).toBe(1);
  });

  it('blocks check-in while on approved leave', async () => {
    const { token, employee } = await createUser({ role: 'employee' });
    const [lt] = await db.select().from(s.leaveTypes).where(eq(s.leaveTypes.code, 'ANNUAL'));
    await db.insert(s.leaveRequests).values({ employeeId: employee!.id, leaveTypeId: lt.id, startDate: '2026-11-03', endDate: '2026-11-03', days: '1', reason: 'x', status: 'approved' });
    setNow(local('2026-11-03', '08:00'));
    const res = await testApp().post('/api/attendance/check-in').set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('errors.attendance.onLeave');
  });

  it('scopes lists: manager sees the team, employee sees self', async () => {
    const mgr = await createUser({ role: 'manager' });
    const teammate = await createUser({ role: 'employee', departmentId: mgr.employee!.departmentId });
    const outsider = await createUser({ role: 'employee' });
    setNow(local('2026-11-03', '08:00'));
    for (const u of [mgr, teammate, outsider]) await testApp().post('/api/attendance/check-in').set(auth(u.token));
    const m = await testApp().get('/api/attendance?from=2026-11-01&to=2026-11-30').set(auth(mgr.token));
    expect(m.body.data.map((r: any) => r.employee.id).sort()).toEqual([mgr.employee!.id, teammate.employee!.id].sort());
    const e = await testApp().get('/api/attendance').set(auth(outsider.token));
    expect(e.body.data.map((r: any) => r.employee.id)).toEqual([outsider.employee!.id]);
    const f = await testApp().get('/api/attendance?status=present').set(auth(mgr.token));
    expect(f.body.data.every((r: any) => r.status === 'present')).toBe(true);
  });

  it('lets HR correct a record only with a note', async () => {
    const hr = await createUser({ role: 'hr_admin' });
    const u = await createUser({ role: 'employee' });
    setNow(local('2026-11-03', '09:00'));
    const rec = (await testApp().post('/api/attendance/check-in').set(auth(u.token))).body.data;
    const noNote = await testApp().put(`/api/attendance/${rec.id}`).set(auth(hr.token)).send({ checkInAt: local('2026-11-03', '08:00').toISOString() });
    expect(noNote.status).toBe(400);
    const ok = await testApp()
      .put(`/api/attendance/${rec.id}`)
      .set(auth(hr.token))
      .send({ checkInAt: local('2026-11-03', '08:00').toISOString(), checkOutAt: local('2026-11-03', '17:00').toISOString(), note: 'ລືມສະແກນ' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'present', lateMinutes: 0, workedMinutes: 540, note: 'ລືມສະແກນ' });
    expect((await testApp().put(`/api/attendance/${rec.id}`).set(auth(u.token)).send({ note: 'x' })).status).toBe(403);
  });

  it('exports CSV with a BOM and Lao headers', async () => {
    const hr = await createUser({ role: 'hr_admin' });
    setNow(local('2026-11-03', '08:00'));
    await testApp().post('/api/attendance/check-in').set(auth(hr.token));
    const res = await testApp().get('/api/attendance/export?lang=lo&from=2026-11-01&to=2026-11-30').set(auth(hr.token)).buffer(true).parse((r, cb) => {
      let data = '';
      r.on('data', (c: Buffer) => (data += c.toString('utf8')));
      r.on('end', () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.body.startsWith('﻿')).toBe(true);
    expect(res.body).toContain('ວັນທີ');
    expect(res.body).toContain('03/11/2026');
  });

  it('marks absences on working days only and never twice', async () => {
    const present = await createEmployee();
    const absent = await createEmployee();
    const onLeave = await createEmployee();
    await createEmployee({ employmentStatus: 'inactive' });
    await db.insert(s.attendance).values({ employeeId: present.id, workDate: '2026-11-03', status: 'present', checkInAt: local('2026-11-03', '08:00') });
    const [lt] = await db.select().from(s.leaveTypes).where(eq(s.leaveTypes.code, 'ANNUAL'));
    await db.insert(s.leaveRequests).values({ employeeId: onLeave.id, leaveTypeId: lt.id, startDate: '2026-11-02', endDate: '2026-11-04', days: '3', reason: 'x', status: 'approved' });
    expect(await markAbsences('2026-11-03')).toEqual({ created: 1 });
    const [row] = await db.select().from(s.attendance).where(and(eq(s.attendance.employeeId, absent.id), eq(s.attendance.workDate, '2026-11-03')));
    expect(row.status).toBe('absent');
    expect(await markAbsences('2026-11-03')).toEqual({ created: 0 });
    expect(await markAbsences('2026-11-08')).toEqual({ created: 0 }); // Sunday
    await db.insert(s.holidays).values({ date: '2026-12-02', nameLo: 'ວັນຊາດ', nameEn: 'National Day' });
    expect(await markAbsences('2026-12-02')).toEqual({ created: 0 });
  });
});
