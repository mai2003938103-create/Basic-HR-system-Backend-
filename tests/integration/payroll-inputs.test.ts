import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import * as s from '../../src/db/schema.js';
import { buildInputs, periodBounds } from '../../src/modules/payroll/inputs.js';
import { localIso } from '../helpers/time.js';
import { resetDb } from '../helpers/db.js';
import { createEmployee, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

const typeId = async (code: string) => (await db.select().from(s.leaveTypes).where(eq(s.leaveTypes.code, code)))[0].id;
const leave = async (employeeId: string, code: string, startDate: string, endDate: string, extra: Partial<typeof s.leaveRequests.$inferInsert> = {}) =>
  db.insert(s.leaveRequests).values({ employeeId, leaveTypeId: await typeId(code), startDate, endDate, days: '1', reason: 'x', status: 'approved', ...extra });

describe('payroll inputs', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('gives the bounds of a period', () => {
    expect(periodBounds('2026-11')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(periodBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('prorates working days for a mid-month joiner', async () => {
    const e = await createEmployee({ hireDate: '2026-11-16', basicSalary: '6000000' });
    const inp = (await buildInputs(db, '2026-11')).get(e.id)!;
    expect(inp).toMatchObject({ basic: 6000000, periodWorkDays: 21, paidWorkDays: 11 });
  });

  it('pays a full month to someone who never checks in (Review Focus 2)', async () => {
    const e = await createEmployee({ hireDate: '2025-01-01' });
    const inp = (await buildInputs(db, '2026-11')).get(e.id)!;
    expect(inp).toMatchObject({ overtimeMinutesWeekday: 0, overtimeMinutesRestday: 0, unpaidDays: 0, periodWorkDays: 21, paidWorkDays: 21 });
  });

  it('counts only approved unpaid leave inside the period, half days as 0.5', async () => {
    const e = await createEmployee();
    await leave(e.id, 'UNPAID', '2026-11-30', '2026-12-02');
    await leave(e.id, 'UNPAID', '2026-11-18', '2026-11-18', { halfDay: 'afternoon', days: '0.5' });
    await leave(e.id, 'UNPAID', '2026-11-20', '2026-11-20', { status: 'pending' });
    await leave(e.id, 'ANNUAL', '2026-11-23', '2026-11-24');
    expect((await buildInputs(db, '2026-11')).get(e.id)!.unpaidDays).toBe(1.5);
  });

  it('splits overtime into weekday and rest-day minutes and caps the month', async () => {
    const e = await createEmployee();
    const row = (workDate: string, overtimeMinutes: number) => ({ employeeId: e.id, workDate, status: 'present' as const, overtimeMinutes, checkInAt: new Date(localIso(workDate, '08:00')) });
    await db.insert(s.attendance).values([row('2026-11-03', 90), row('2026-11-04', 30), row('2026-11-07', 240)]);
    expect((await buildInputs(db, '2026-11')).get(e.id)!).toMatchObject({ overtimeMinutesWeekday: 120, overtimeMinutesRestday: 240 });
    await db.update(s.companySettings).set({ payrollConfig: { overtime: { maxMinutesPerMonth: 200 } } });
    expect((await buildInputs(db, '2026-11')).get(e.id)!).toMatchObject({ overtimeMinutesWeekday: 120, overtimeMinutesRestday: 80 });
  });

  it('copies active allowances and leaves out ended employees', async () => {
    const e = await createEmployee();
    const gone = await createEmployee({ employmentStatus: 'terminated', endDate: '2026-10-31' });
    const [meal] = await db.select().from(s.allowanceTypes).where(eq(s.allowanceTypes.code, 'MEAL'));
    await db.insert(s.employeeAllowances).values({ employeeId: e.id, allowanceTypeId: meal.id, amount: 300000 });
    const map = await buildInputs(db, '2026-11');
    expect(map.get(e.id)!.allowances).toEqual([{ typeId: meal.id, code: 'MEAL', nameLo: meal.nameLo, nameEn: meal.nameEn, amount: 300000, taxable: true }]);
    expect(map.has(gone.id)).toBe(false);
  });

  it('includes someone who left mid-month up to their end date', async () => {
    const e = await createEmployee({ employmentStatus: 'terminated', endDate: '2026-11-13' });
    expect((await buildInputs(db, '2026-11')).get(e.id)!).toMatchObject({ periodWorkDays: 21, paidWorkDays: 10 });
  });

  it('sets the end date when an employee is terminated and clears it on return', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T10:00:00+07:00'));
    try {
      const hr = await createUser({ role: 'hr_admin' });
      const e = await createEmployee();
      await testApp().patch(`/api/employees/${e.id}/status`).set(auth(hr.token)).send({ status: 'terminated' }).expect(200);
      expect((await db.select().from(s.employees).where(eq(s.employees.id, e.id)))[0].endDate).toBe('2026-11-13');
      await testApp().patch(`/api/employees/${e.id}/status`).set(auth(hr.token)).send({ status: 'active' }).expect(200);
      expect((await db.select().from(s.employees).where(eq(s.employees.id, e.id)))[0].endDate).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
