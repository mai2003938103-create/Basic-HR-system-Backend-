import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import * as s from '../../src/db/schema.js';
import { signAccessToken } from '../../src/lib/jwt.js';
import { resetDb } from '../helpers/db.js';
import { createDepartment, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const typeId = async (code: string) => (await db.select().from(s.leaveTypes).where(eq(s.leaveTypes.code, code)))[0].id;
const tok = (u: { user: { id: string } }) => signAccessToken({ sub: u.user.id });

async function team() {
  const mgr = await createUser({ role: 'manager' });
  const emp = await createUser({ role: 'employee', departmentId: mgr.employee!.departmentId });
  const hr = await createUser({ role: 'hr_admin' });
  return { mgr, emp, hr };
}

const request = (token: string, body: Record<string, string>, doc?: Buffer) => {
  let r = testApp().post('/api/leave-requests').set(auth(token));
  for (const [k, v] of Object.entries(body)) r = r.field(k, v);
  if (doc) r = r.attach('document', doc, 'doc.pdf');
  return r;
};

describe('leave', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T09:00:00+07:00'));
    await resetDb();
  });
  afterEach(() => vi.useRealTimers());

  it('runs the request → approve flow and updates balance and attendance', async () => {
    const { mgr, emp } = await team();
    const res = await request(tok(emp), { leaveTypeId: await typeId('ANNUAL'), startDate: '2026-11-10', endDate: '2026-11-12', reason: 'ພັກຜ່ອນ' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'pending', days: 3 });
    const [note] = await db.select().from(s.notifications).where(eq(s.notifications.userId, mgr.user.id));
    expect(note.type).toBe('leave.requested');

    const ok = await testApp().put(`/api/leave-requests/${res.body.data.id}/approve`).set(auth(tok(mgr))).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('approved');
    const bal = await testApp().get(`/api/leave-balances?year=2026`).set(auth(tok(emp)));
    const annual = bal.body.data.find((b: any) => b.leaveType.code === 'ANNUAL');
    expect(annual).toMatchObject({ entitledDays: 15, usedDays: 3, remainingDays: 12 });
    const rows = await db.select().from(s.attendance).where(eq(s.attendance.employeeId, emp.employee!.id));
    expect(rows.map((r) => [r.workDate, r.status]).sort()).toEqual([['2026-11-10', 'leave'], ['2026-11-11', 'leave'], ['2026-11-12', 'leave']]);
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, emp.user.id));
    expect(notes.map((n) => n.type)).toContain('leave.approved');
  });

  it('requires a note to reject', async () => {
    const { mgr, emp } = await team();
    const r = (await request(tok(emp), { leaveTypeId: await typeId('PERSONAL'), startDate: '2026-11-10', endDate: '2026-11-10', reason: 'x' })).body.data;
    expect((await testApp().put(`/api/leave-requests/${r.id}/reject`).set(auth(tok(mgr))).send({})).status).toBe(400);
    const ok = await testApp().put(`/api/leave-requests/${r.id}/reject`).set(auth(tok(mgr))).send({ note: 'ຊ່ວງນີ້ວຽກຫຼາຍ' });
    expect(ok.body.data).toMatchObject({ status: 'rejected', decisionNote: 'ຊ່ວງນີ້ວຽກຫຼາຍ' });
  });

  it('rejects overlapping requests and invalid ranges', async () => {
    const { emp } = await team();
    const lt = await typeId('ANNUAL');
    await request(tok(emp), { leaveTypeId: lt, startDate: '2026-11-10', endDate: '2026-11-12', reason: 'a' });
    const overlap = await request(tok(emp), { leaveTypeId: lt, startDate: '2026-11-12', endDate: '2026-11-13', reason: 'b' });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.message).toBe('errors.leave.overlap');
    const range = await request(tok(emp), { leaveTypeId: lt, startDate: '2026-11-20', endDate: '2026-11-19', reason: 'c' });
    expect(range.body.error.message).toBe('errors.leave.invalidRange');
    const weekend = await request(tok(emp), { leaveTypeId: lt, startDate: '2026-11-14', endDate: '2026-11-15', reason: 'd' });
    expect(weekend.body.error.message).toBe('errors.leave.zeroDays');
  });

  it('refuses more days than the balance allows', async () => {
    const { emp } = await team();
    const res = await request(tok(emp), { leaveTypeId: await typeId('PERSONAL'), startDate: '2026-11-09', endDate: '2026-11-13', reason: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('errors.leave.insufficientBalance');
  });

  it('requires a document past the threshold and guards who can read it', async () => {
    const { mgr, emp } = await team();
    const outsider = await createUser({ role: 'employee' });
    const lt = await typeId('SICK');
    const noDoc = await request(tok(emp), { leaveTypeId: lt, startDate: '2026-11-09', endDate: '2026-11-11', reason: 'ບໍ່ສະບາຍ' });
    expect(noDoc.body.error.message).toBe('errors.leave.documentRequired');
    const withDoc = await request(tok(emp), { leaveTypeId: lt, startDate: '2026-11-09', endDate: '2026-11-11', reason: 'ບໍ່ສະບາຍ' }, PDF);
    expect(withDoc.status).toBe(201);
    const url = withDoc.body.data.documentUrl as string;
    expect((await testApp().get(url).set(auth(tok(mgr)))).status).toBe(200);
    expect((await testApp().get(url).set(auth(tok(outsider)))).status).toBe(404);
  });

  it('routes a manager’s own request to HR', async () => {
    const { mgr, hr } = await team();
    const r = (await request(tok(mgr), { leaveTypeId: await typeId('ANNUAL'), startDate: '2026-11-10', endDate: '2026-11-10', reason: 'x' })).body.data;
    expect((await testApp().put(`/api/leave-requests/${r.id}/approve`).set(auth(tok(mgr))).send({})).status).toBe(403);
    const queue = await testApp().get('/api/leave-requests?toApprove=true').set(auth(tok(hr)));
    expect(queue.body.data.map((x: any) => x.id)).toContain(r.id);
    const mine = await testApp().get('/api/leave-requests?toApprove=true').set(auth(tok(mgr)));
    expect(mine.body.data.map((x: any) => x.id)).not.toContain(r.id);
    expect((await testApp().put(`/api/leave-requests/${r.id}/approve`).set(auth(tok(hr))).send({})).status).toBe(200);
  });

  it('routes requests to HR when the department has no manager', async () => {
    const d = await createDepartment();
    const emp = await createUser({ role: 'employee', departmentId: d.id });
    const hr = await createUser({ role: 'hr_admin' });
    await request(tok(emp), { leaveTypeId: await typeId('ANNUAL'), startDate: '2026-11-10', endDate: '2026-11-10', reason: 'x' });
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, hr.user.id));
    expect(notes.map((n) => n.type)).toContain('leave.requested');
  });

  it('cancels pending and future approved leave, restoring balance', async () => {
    const { mgr, emp } = await team();
    const lt = await typeId('ANNUAL');
    const p = (await request(tok(emp), { leaveTypeId: lt, startDate: '2026-11-17', endDate: '2026-11-17', reason: 'x' })).body.data;
    expect((await testApp().put(`/api/leave-requests/${p.id}/cancel`).set(auth(tok(emp)))).body.data.status).toBe('cancelled');
    const a = (await request(tok(emp), { leaveTypeId: lt, startDate: '2026-11-10', endDate: '2026-11-11', reason: 'y' })).body.data;
    await testApp().put(`/api/leave-requests/${a.id}/approve`).set(auth(tok(mgr))).send({});
    expect((await testApp().put(`/api/leave-requests/${a.id}/cancel`).set(auth(tok(emp)))).status).toBe(200);
    const bal = (await testApp().get('/api/leave-balances?year=2026').set(auth(tok(emp)))).body.data.find((b: any) => b.leaveType.code === 'ANNUAL');
    expect(bal.usedDays).toBe(0);
    expect(await db.$count(s.attendance, and(eq(s.attendance.employeeId, emp.employee!.id), eq(s.attendance.status, 'leave')))).toBe(0);
  });

  it('does not cancel approved leave that has started', async () => {
    const { mgr, emp } = await team();
    const a = (await request(tok(emp), { leaveTypeId: await typeId('ANNUAL'), startDate: '2026-11-04', endDate: '2026-11-05', reason: 'x' })).body.data;
    await testApp().put(`/api/leave-requests/${a.id}/approve`).set(auth(tok(mgr))).send({});
    vi.setSystemTime(new Date('2026-11-05T09:00:00+07:00'));
    const res = await testApp().put(`/api/leave-requests/${a.id}/cancel`).set(auth(tok(emp)));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('errors.leave.cannotCancel');
  });

  it('charges each year its own days (Review Focus 2)', async () => {
    const { mgr, emp } = await team();
    const r = (await request(tok(emp), { leaveTypeId: await typeId('ANNUAL'), startDate: '2026-12-30', endDate: '2027-01-02', reason: 'ປີໃໝ່' })).body.data;
    expect(r.days).toBe(3);
    await testApp().put(`/api/leave-requests/${r.id}/approve`).set(auth(tok(mgr))).send({});
    const y26 = (await testApp().get('/api/leave-balances?year=2026').set(auth(tok(emp)))).body.data.find((b: any) => b.leaveType.code === 'ANNUAL');
    const y27 = (await testApp().get('/api/leave-balances?year=2027').set(auth(tok(emp)))).body.data.find((b: any) => b.leaveType.code === 'ANNUAL');
    expect(y26.usedDays).toBe(2);
    expect(y27.usedDays).toBe(1);
  });

  it('approves only once under concurrent clicks (Review Focus 4)', async () => {
    const { mgr, emp } = await team();
    const r = (await request(tok(emp), { leaveTypeId: await typeId('ANNUAL'), startDate: '2026-11-10', endDate: '2026-11-11', reason: 'x' })).body.data;
    const t = tok(mgr);
    const res = await Promise.all([
      testApp().put(`/api/leave-requests/${r.id}/approve`).set(auth(t)).send({}),
      testApp().put(`/api/leave-requests/${r.id}/approve`).set(auth(t)).send({}),
    ]);
    expect(res.map((x) => x.status).sort()).toEqual([200, 409]);
    const bal = (await testApp().get('/api/leave-balances?year=2026').set(auth(tok(emp)))).body.data.find((b: any) => b.leaveType.code === 'ANNUAL');
    expect(bal.usedDays).toBe(2);
  });

  it('lets HR adjust entitlement', async () => {
    const { emp, hr } = await team();
    const bal = (await testApp().get(`/api/leave-balances?year=2026&employeeId=${emp.employee!.id}`).set(auth(tok(hr)))).body.data.find((b: any) => b.leaveType.code === 'ANNUAL');
    const res = await testApp().put(`/api/leave-balances/${bal.id}`).set(auth(tok(hr))).send({ entitledDays: 18 });
    expect(res.body.data).toMatchObject({ entitledDays: 18, remainingDays: 18 });
    expect((await testApp().put(`/api/leave-balances/${bal.id}`).set(auth(tok(emp))).send({ entitledDays: 99 })).status).toBe(403);
  });
});
