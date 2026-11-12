import { prisma as db, resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

const PERIOD = '2026-10';

async function setup() {
  const hr = await createUser({ role: 'hr_admin', employee: { basicSalary: 6000000, hireDate: '2024-01-01' } });
  const boss = await createUser({ role: 'super_admin', employee: { basicSalary: 3000000, hireDate: '2024-01-01' } });
  const staff = await createUser({ role: 'employee', employee: { basicSalary: 2000000, hireDate: '2024-01-01' } });
  return { hr, boss, staff };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

const createRun = (token: string, period = PERIOD) => testApp().post('/api/payroll/runs').set(auth(token)).send({ period });
const getRun = (token: string, id: string) => testApp().get(`/api/payroll/runs/${id}`).set(auth(token));
const act = (token: string, id: string, action: string, body?: object) => testApp().put(`/api/payroll/runs/${id}/${action}`).set(auth(token)).send(body ?? {});

describe('payroll runs', () => {
  let c: Ctx;
  beforeEach(async () => {
    await resetDb();
    c = await setup();
  });

  it('creates a draft with a line per employee and the spec §5.6 maths', async () => {
    const r = await createRun(c.hr.token);
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ period: PERIOD, status: 'draft', employeeCount: 3, payDate: '2026-10-25' });

    const run = (await getRun(c.hr.token, r.body.data.id)).body.data;
    const hrLine = run.lines.find((l: any) => l.employeeId === c.hr.employee!.id);
    // basic 6,000,000: social security capped at 4,500,000 → 247,500; two tax steps → 200,250
    expect(hrLine.calc).toMatchObject({ gross: 6000000, ssEmployee: 247500, incomeTax: 200250, net: 5552250 });
    const lowLine = run.lines.find((l: any) => l.employeeId === c.staff.employee!.id);
    expect(lowLine.calc).toMatchObject({ incomeTax: 0 });
    expect(run).toMatchObject({ canEdit: true, canSubmit: true, canApprove: false, canPay: false, previous: null, ratesConfirmed: false });
  });

  it('rejects a repeated or far-future period and non-HR callers', async () => {
    await createRun(c.hr.token);
    expect((await createRun(c.hr.token)).status).toBe(400);
    expect((await createRun(c.hr.token, '2030-01')).status).toBe(400);
    expect((await createRun(c.staff.token, '2026-09')).status).toBe(403);
    expect((await testApp().get('/api/payroll/runs').set(auth(c.staff.token))).status).toBe(403);
  });

  it('adjusts a line, keeps the edit on recalculate and refuses a negative net', async () => {
    const id = (await createRun(c.hr.token)).body.data.id;
    const empId = c.staff.employee!.id;
    const put = (body: object) => testApp().put(`/api/payroll/runs/${id}/items/${empId}`).set(auth(c.hr.token)).send(body);
    const base = { allowance: 0, bonus: 0, overtimeMinutes: 0, unpaidDays: 0, otherDeduction: 0, note: null };

    expect((await put({ ...base, bonus: 500000, allowance: 300000, note: 'Q3 bonus' })).status).toBe(200);
    expect((await put({ ...base, otherDeduction: 99999999 })).status).toBe(400);
    expect((await put({ ...base, bonus: 500000, allowance: 300000, note: 'Q3 bonus' })).status).toBe(200);

    await testApp().post(`/api/payroll/runs/${id}/recalculate`).set(auth(c.hr.token)).expect(200);
    const line = (await getRun(c.hr.token, id)).body.data.lines.find((l: any) => l.employeeId === empId);
    expect(line.item).toMatchObject({ bonus: 500000, allowance: 300000, note: 'Q3 bonus' });
    expect(line.calc.gross).toBe(2000000 + 300000 + 500000);
    expect((await testApp().put(`/api/payroll/runs/${id}/items/${empId}`).set(auth(c.staff.token)).send(base)).status).toBe(403);
  });

  it('runs draft → pending → approved → paid with separation of duties', async () => {
    const id = (await createRun(c.hr.token)).body.data.id;

    expect((await act(c.hr.token, id, 'approve')).status).toBe(403); // hr_admin has no approve right
    expect((await act(c.hr.token, id, 'submit')).status).toBe(200);
    expect((await getRun(c.hr.token, id)).body.data).toMatchObject({ status: 'pending', canEdit: false });
    expect((await db.payRun.findUniqueOrThrow({ where: { id } })).configSnapshot).not.toBeNull();
    expect((await db.notification.count({ where: { userId: c.boss.user.id, type: 'payroll.submitted' } }))).toBe(1);

    expect((await act(c.boss.token, id, 'reject', {})).status).toBe(400); // reason required
    expect((await act(c.boss.token, id, 'reject', { note: 'check bonus' })).status).toBe(200);
    expect((await getRun(c.hr.token, id)).body.data.status).toBe('draft');
    expect((await db.notification.count({ where: { userId: c.hr.user.id, type: 'payroll.returned' } }))).toBe(1);

    await act(c.hr.token, id, 'submit').expect(200);
    expect((await act(c.hr.token, id, 'pay')).status).toBe(409); // not approved yet
    const selfSubmitted = await createRun(c.boss.token, '2026-09');
    await act(c.boss.token, selfSubmitted.body.data.id, 'submit').expect(200);
    expect((await act(c.boss.token, selfSubmitted.body.data.id, 'approve')).status).toBe(409); // submitter cannot approve

    expect((await act(c.boss.token, id, 'approve')).status).toBe(200);
    expect((await act(c.boss.token, id, 'approve')).status).toBe(409); // not pending any more
    expect((await act(c.hr.token, id, 'pay')).status).toBe(200);

    expect((await db.notification.count({ where: { type: 'payslip.ready' } }))).toBe(3);
    expect((await testApp().delete(`/api/payroll/runs/${id}`).set(auth(c.hr.token))).status).toBe(409); // paid runs stay
    expect((await testApp().post(`/api/payroll/runs/${id}/recalculate`).set(auth(c.hr.token))).status).toBe(409);
  });

  it('compares with the previous run that left draft', async () => {
    const first = (await createRun(c.hr.token, '2026-09')).body.data.id;
    await act(c.hr.token, first, 'submit').expect(200);
    const second = (await createRun(c.hr.token)).body.data.id;
    const run = (await getRun(c.hr.token, second)).body.data;
    expect(run.previous).toMatchObject({ period: '2026-09', employeeCount: 3 });
    expect(run.lines.every((l: any) => l.previousNet !== null)).toBe(true);
  });

  it('deletes a draft', async () => {
    const id = (await createRun(c.hr.token)).body.data.id;
    expect((await testApp().delete(`/api/payroll/runs/${id}`).set(auth(c.hr.token))).status).toBe(204);
    expect((await getRun(c.hr.token, id)).status).toBe(404);
  });

  it('exports the bank file only once approved and counts missing accounts', async () => {
    const id = (await createRun(c.hr.token)).body.data.id;
    const exp = () => testApp().get(`/api/payroll/runs/${id}/export`).set(auth(c.hr.token));
    expect((await exp()).status).toBe(409);
    await act(c.hr.token, id, 'submit').expect(200);
    await act(c.boss.token, id, 'approve').expect(200);
    const r = await exp();
    expect(r.status).toBe(200);
    expect(r.headers['x-missing-bank']).toBe('3');
    expect(r.text).toContain('5552250');
  });
});

describe('payslips and reports', () => {
  let c: Ctx;
  let id: string;
  beforeEach(async () => {
    await resetDb();
    c = await setup();
    id = (await createRun(c.hr.token)).body.data.id;
    await act(c.hr.token, id, 'submit').expect(200);
    await act(c.boss.token, id, 'approve').expect(200);
  });

  it('shows an employee only their own payslip, and only once paid', async () => {
    const mine = c.staff.employee!.id;
    expect((await testApp().get('/api/payslips').set(auth(c.staff.token))).body.data).toEqual([]);
    expect((await testApp().get(`/api/payslips/${id}/${mine}`).set(auth(c.staff.token))).status).toBe(404);

    await act(c.hr.token, id, 'pay').expect(200);
    const list = (await testApp().get('/api/payslips').set(auth(c.staff.token))).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ period: PERIOD, gross: 2000000, net: 1890000 });
    const slip = (await testApp().get(`/api/payslips/${id}/${mine}`).set(auth(c.staff.token))).body.data;
    expect(slip).toMatchObject({ period: PERIOD, status: 'paid', ratesConfirmed: false, calc: { net: 1890000 } });
    expect(slip.rates).toMatchObject({ ssEmployeeRate: 5.5 });

    expect((await testApp().get(`/api/payslips/${id}/${c.hr.employee!.id}`).set(auth(c.staff.token))).status).toBe(403);
    expect((await testApp().get(`/api/payslips/${id}/${mine}`).set(auth(c.hr.token))).status).toBe(200); // payroll.read
  });

  it('serves the four reports to HR and refuses employees', async () => {
    const get = (path: string, token = c.hr.token) => testApp().get(`/api/reports/${path}`).set(auth(token));
    const hc = (await get('headcount')).body.data;
    expect(hc.total).toBe(3);
    expect(hc.movement).toHaveLength(12);
    expect((await get('attendance?month=2026-10')).body.data).toMatchObject({ month: '2026-10', rows: expect.any(Array) });
    expect((await get('leave?year=2026')).body.data.byMonth).toHaveLength(12);
    const pay = (await get('payroll?year=2026')).body.data;
    expect(pay).toMatchObject({ year: 2026, latestPeriod: PERIOD });
    expect(pay.byMonth).toHaveLength(1);
    expect(pay.byDepartment.reduce((s: number, d: any) => s + d.headcount, 0)).toBe(3);
    expect((await get('headcount', c.staff.token)).status).toBe(403);
  });
});
