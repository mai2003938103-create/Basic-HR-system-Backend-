import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import * as s from '../../src/db/schema.js';
import { resetDb } from '../helpers/db.js';
import { seedBase } from '../../scripts/seed.js';

const counts = () =>
  Promise.all([db.$count(s.roles), db.$count(s.permissions), db.$count(s.leaveTypes), db.$count(s.users), db.$count(s.rolePermissions), db.$count(s.allowanceTypes)]);

async function roleCodes(code: string) {
  const role = await db.query.roles.findFirst({ where: eq(s.roles.code, code), with: { permissions: { with: { permission: true } } } });
  return role!.permissions.map((p) => p.permission.code);
}

describe('base seed', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('creates the four system roles and the editable director role', async () => {
    const roles = await db.select({ code: s.roles.code, isSystem: s.roles.isSystem }).from(s.roles).orderBy(s.roles.code);
    expect(roles.map((r) => r.code)).toEqual(['director', 'employee', 'hr_admin', 'manager', 'super_admin']);
    expect(roles.find((r) => r.code === 'director')!.isSystem).toBe(false);
  });

  it('gives super_admin every permission', async () => {
    const total = await db.$count(s.permissions);
    const sa = await db.query.roles.findFirst({ where: eq(s.roles.code, 'super_admin'), with: { permissions: true } });
    expect(total).toBeGreaterThan(0);
    expect(sa!.permissions).toHaveLength(total);
  });

  it('gives employee exactly the self-service permissions', async () => {
    const emp = await db.query.roles.findFirst({
      where: eq(s.roles.code, 'employee'),
      with: { permissions: { with: { permission: true } } },
    });
    expect(emp!.permissions.map((p) => p.permission.code).sort()).toEqual(
      ['attendance.check', 'attendance.read', 'leave.read', 'leave.request', 'payslip.self'],
    );
  });

  it('creates five leave types and one settings row', async () => {
    expect(await db.$count(s.leaveTypes)).toBe(5);
    const settings = await db.select().from(s.companySettings);
    expect(settings).toHaveLength(1);
    expect(settings[0].workStart).toBe('08:00');
  });

  it('rejects a second settings row', async () => {
    await expect(
      db.insert(s.companySettings).values({ id: 2, companyNameLo: 'x', companyNameEn: 'x', workingDays: [1] }),
    ).rejects.toThrow();
  });

  it('creates the super admin who must change password', async () => {
    const [admin] = await db.select().from(s.users).where(eq(s.users.email, process.env.ADMIN_EMAIL!));
    expect(admin.mustChangePassword).toBe(true);
  });

  it('seeds Stage 2 permissions, role grants, payroll config and allowance types', async () => {
    const perms = (await db.select().from(s.permissions)).map((p) => p.code);
    expect(perms).toEqual(expect.arrayContaining(['payroll.read', 'payroll.manage', 'payroll.approve', 'payslip.self', 'report.view', 'settings.manage']));
    expect(await roleCodes('hr_admin')).not.toContain('payroll.approve');
    expect(await roleCodes('hr_admin')).toEqual(expect.arrayContaining(['payroll.read', 'payroll.manage', 'settings.manage', 'report.view']));
    expect(await roleCodes('director')).toEqual(expect.arrayContaining(['payroll.approve', 'payroll.read', 'report.view', 'payslip.self']));
    expect(await roleCodes('manager')).toEqual(expect.arrayContaining(['payslip.self', 'report.view']));
    const [st] = await db.select().from(s.companySettings);
    expect(st.payrollConfig).toMatchObject({ workDaysPerMonth: 22, socialSecurity: { employeeRate: 5.5, employerRate: 6, ceiling: 4500000 }, confirmedAt: null });
    expect((await db.select().from(s.allowanceTypes)).map((a) => a.code).sort()).toEqual(['MEAL', 'POSITION', 'TRANSPORT']);
  });

  it('grants newly added permissions to existing roles without undoing edits', async () => {
    const [hr] = await db.select().from(s.roles).where(eq(s.roles.code, 'hr_admin'));
    const [rp] = await db.select().from(s.permissions).where(eq(s.permissions.code, 'report.view'));
    await db.delete(s.rolePermissions).where(and(eq(s.rolePermissions.roleId, hr.id), eq(s.rolePermissions.permissionId, rp.id)));
    await seedBase(db);
    expect(await roleCodes('hr_admin')).not.toContain('report.view'); // an edit made in the app survives a re-seed
  });

  it('is idempotent', async () => {
    const before = await counts();
    await seedBase(db);
    expect(await counts()).toEqual(before);
  });
});
