import bcrypt from 'bcrypt';
import { eq, sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import type { Db } from '../src/db/client.js';
import * as s from '../src/db/schema.js';
import { ALLOWANCE_TYPES, DEFAULT_SETTINGS, LEAVE_TYPES, PERMISSIONS, ROLES } from './seed-data.js';
import { DEFAULT_PAYROLL_CONFIG } from '../src/modules/payroll/config.js';

export async function seedBase(db: Db): Promise<void> {
  const added = new Set(
    (await db.insert(s.permissions).values(PERMISSIONS).onConflictDoNothing({ target: s.permissions.code }).returning({ code: s.permissions.code })).map((p) => p.code),
  );
  const allPerms = await db.select().from(s.permissions);

  for (const r of ROLES) {
    await db
      .insert(s.roles)
      .values({ code: r.code, nameLo: r.nameLo, nameEn: r.nameEn, scope: r.scope, isSystem: r.system ?? true })
      .onConflictDoNothing({ target: s.roles.code });
    const [role] = await db.select().from(s.roles).where(eq(s.roles.code, r.code));
    const existing = await db.$count(s.rolePermissions, eq(s.rolePermissions.roleId, role.id));
    // Fill a role's permissions only when it has none (super_admin always gets all); otherwise grant only
    // permissions created by this run (a new release), so edits made in the app survive a re-seed.
    const listed = (p: { code: string }) => r.permissions === '*' || r.permissions.includes(p.code);
    const wanted = existing === 0 || r.permissions === '*' ? allPerms.filter(listed) : allPerms.filter((p) => added.has(p.code) && listed(p));
    if (wanted.length) {
      await db
        .insert(s.rolePermissions)
        .values(wanted.map((p) => ({ roleId: role.id, permissionId: p.id })))
        .onConflictDoNothing();
    }
  }

  await db.insert(s.leaveTypes).values(LEAVE_TYPES).onConflictDoNothing({ target: s.leaveTypes.code });
  await db.insert(s.companySettings).values({ id: 1, ...DEFAULT_SETTINGS, payrollConfig: DEFAULT_PAYROLL_CONFIG }).onConflictDoNothing();
  // Installs from Stage 1 have an empty payroll_config: give them the general defaults once.
  await db.update(s.companySettings).set({ payrollConfig: DEFAULT_PAYROLL_CONFIG }).where(sql`${s.companySettings.payrollConfig} = '{}'::jsonb`);
  await db.insert(s.allowanceTypes).values(ALLOWANCE_TYPES).onConflictDoNothing({ target: s.allowanceTypes.code });

  const email = process.env.ADMIN_EMAIL ?? 'admin@systory.la';
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123';
  const [existingAdmin] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
  if (!existingAdmin) {
    const [sa] = await db.select().from(s.roles).where(eq(s.roles.code, 'super_admin'));
    await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(s.users)
        .values({ email, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true })
        .returning();
      await tx.insert(s.userRoles).values({ userId: u.id, roleId: sa.id });
    });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { db, pool } = await import('../src/db/client.js');
  try {
    await seedBase(db);
    console.log('Base seed complete');
  } finally {
    await pool.end();
  }
}
