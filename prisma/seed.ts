import bcrypt from 'bcrypt';
import { pathToFileURL } from 'node:url';
import type { Db } from '../src/models/prisma.js';
import { ALLOWANCE_TYPES, DEFAULT_SETTINGS, LEAVE_TYPES, PERMISSIONS, ROLES } from './seed-data.js';
import { DEFAULT_PAYROLL_CONFIG } from '../src/services/payroll/config.js';

const isEmptyObject = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;

export async function seedBase(db: Db): Promise<void> {
  const before = new Set((await db.permission.findMany({ select: { code: true } })).map((p) => p.code));
  await db.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });
  const added = new Set(PERMISSIONS.map((p) => p.code).filter((c) => !before.has(c)));
  const allPerms = await db.permission.findMany();

  for (const r of ROLES) {
    const role =
      (await db.role.findUnique({ where: { code: r.code } })) ??
      (await db.role.create({ data: { code: r.code, nameLo: r.nameLo, nameEn: r.nameEn, scope: r.scope, isSystem: r.system ?? true } }));
    const existing = await db.rolePermission.count({ where: { roleId: role.id } });
    // Fill a role's permissions only when it has none (super_admin always gets all); otherwise grant only
    // permissions created by this run (a new release), so edits made in the app survive a re-seed.
    const listed = (p: { code: string }) => r.permissions === '*' || r.permissions.includes(p.code);
    const wanted = existing === 0 || r.permissions === '*' ? allPerms.filter(listed) : allPerms.filter((p) => added.has(p.code) && listed(p));
    if (wanted.length) {
      await db.rolePermission.createMany({ data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
    }
  }

  await db.leaveType.createMany({ data: LEAVE_TYPES, skipDuplicates: true });
  const settings = await db.companySettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    await db.companySettings.create({ data: { id: 1, ...DEFAULT_SETTINGS, payrollConfig: DEFAULT_PAYROLL_CONFIG, notificationConfig: {} } });
  } else if (isEmptyObject(settings.payrollConfig)) {
    // Installs from Stage 1 have an empty payroll_config: give them the general defaults once.
    await db.companySettings.update({ where: { id: 1 }, data: { payrollConfig: DEFAULT_PAYROLL_CONFIG } });
  }
  await db.allowanceType.createMany({ data: ALLOWANCE_TYPES, skipDuplicates: true });

  const email = process.env.ADMIN_EMAIL ?? 'admin@systory.la';
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123';
  if (!(await db.user.findUnique({ where: { email }, select: { id: true } }))) {
    const sa = await db.role.findUniqueOrThrow({ where: { code: 'super_admin' } });
    await db.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, roles: { create: { roleId: sa.id } } },
    });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { prisma } = await import('../src/models/prisma.js');
  try {
    await seedBase(prisma);
    console.log('Base seed complete');
  } finally {
    await prisma.$disconnect();
  }
}
