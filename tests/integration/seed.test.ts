import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import * as s from '../../src/db/schema.js';
import { resetDb } from '../helpers/db.js';
import { seedBase } from '../../scripts/seed.js';

const counts = () =>
  Promise.all([db.$count(s.roles), db.$count(s.permissions), db.$count(s.leaveTypes), db.$count(s.users), db.$count(s.rolePermissions)]);

describe('base seed', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('creates the four system roles', async () => {
    const roles = await db.select({ code: s.roles.code }).from(s.roles).orderBy(s.roles.code);
    expect(roles.map((r) => r.code)).toEqual(['employee', 'hr_admin', 'manager', 'super_admin']);
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
      ['attendance.check', 'attendance.read', 'leave.read', 'leave.request'],
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

  it('is idempotent', async () => {
    const before = await counts();
    await seedBase(db);
    expect(await counts()).toEqual(before);
  });
});
