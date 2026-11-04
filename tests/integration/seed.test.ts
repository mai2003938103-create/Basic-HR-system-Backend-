import { prisma as db, resetDb } from '../helpers/db.js';
import { seedBase } from '../../prisma/seed.js';

const counts = () =>
  Promise.all([db.role.count(), db.permission.count(), db.leaveType.count(), db.user.count(), db.rolePermission.count(), db.allowanceType.count()]);

async function roleCodes(code: string) {
  const role = await db.role.findUnique({ where: { code }, include: { permissions: { include: { permission: true } } } });
  return role!.permissions.map((p) => p.permission.code);
}

describe('base seed', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('creates the four system roles and the editable director role', async () => {
    const roles = await db.role.findMany({ select: { code: true, isSystem: true }, orderBy: { code: 'asc' } });
    expect(roles.map((r) => r.code)).toEqual(['director', 'employee', 'hr_admin', 'manager', 'super_admin']);
    expect(roles.find((r) => r.code === 'director')!.isSystem).toBe(false);
  });

  it('gives super_admin every permission', async () => {
    const total = await db.permission.count();
    const sa = await db.role.findUnique({ where: { code: 'super_admin' }, include: { permissions: true } });
    expect(total).toBeGreaterThan(0);
    expect(sa!.permissions).toHaveLength(total);
  });

  it('gives employee exactly the self-service permissions', async () => {
    const emp = await db.role.findUnique({ where: { code: 'employee' }, include: { permissions: { include: { permission: true } } } });
    expect(emp!.permissions.map((p) => p.permission.code).sort()).toEqual(
      ['attendance.check', 'attendance.read', 'leave.read', 'leave.request', 'payslip.self'],
    );
  });

  it('creates five leave types and one settings row', async () => {
    expect(await db.leaveType.count()).toBe(5);
    const settings = await db.companySettings.findMany();
    expect(settings).toHaveLength(1);
    expect(settings[0].workStart).toBe('08:00');
  });

  it('rejects a second settings row', async () => {
    await expect(
      db.companySettings.create({ data: { id: 2, companyNameLo: 'x', companyNameEn: 'x', workingDays: [1], payrollConfig: {}, notificationConfig: {} } }),
    ).rejects.toThrow();
  });

  it('creates the super admin who must change password', async () => {
    const admin = await db.user.findUnique({ where: { email: process.env.ADMIN_EMAIL! } });
    expect(admin!.mustChangePassword).toBe(true);
  });

  it('seeds Stage 2 permissions, role grants, payroll config and allowance types', async () => {
    const perms = (await db.permission.findMany()).map((p) => p.code);
    expect(perms).toEqual(expect.arrayContaining(['payroll.read', 'payroll.manage', 'payroll.approve', 'payslip.self', 'report.view', 'settings.manage']));
    expect(await roleCodes('hr_admin')).not.toContain('payroll.approve');
    expect(await roleCodes('hr_admin')).toEqual(expect.arrayContaining(['payroll.read', 'payroll.manage', 'settings.manage', 'report.view']));
    expect(await roleCodes('director')).toEqual(expect.arrayContaining(['payroll.approve', 'payroll.read', 'report.view', 'payslip.self']));
    expect(await roleCodes('manager')).toEqual(expect.arrayContaining(['payslip.self', 'report.view']));
    const st = (await db.companySettings.findUnique({ where: { id: 1 } }))!;
    expect(st.payrollConfig).toMatchObject({ workDaysPerMonth: 22, socialSecurity: { employeeRate: 5.5, employerRate: 6, ceiling: 4500000 }, confirmedAt: null });
    expect((await db.allowanceType.findMany()).map((a) => a.code).sort()).toEqual(['MEAL', 'POSITION', 'TRANSPORT']);
  });

  it('grants newly added permissions to existing roles without undoing edits', async () => {
    const hr = await db.role.findUniqueOrThrow({ where: { code: 'hr_admin' } });
    const rp = await db.permission.findUniqueOrThrow({ where: { code: 'report.view' } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: hr.id, permissionId: rp.id } } });
    await seedBase(db);
    expect(await roleCodes('hr_admin')).not.toContain('report.view'); // an edit made in the app survives a re-seed
  });

  it('is idempotent', async () => {
    const before = await counts();
    await seedBase(db);
    expect(await counts()).toEqual(before);
  });
});
