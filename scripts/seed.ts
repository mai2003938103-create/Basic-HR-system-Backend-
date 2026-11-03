import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import type { Db } from '../src/db/client.js';
import * as s from '../src/db/schema.js';
import { DEFAULT_SETTINGS, LEAVE_TYPES, PERMISSIONS, ROLES } from './seed-data.js';

export async function seedBase(db: Db): Promise<void> {
  await db.insert(s.permissions).values(PERMISSIONS).onConflictDoNothing({ target: s.permissions.code });
  const allPerms = await db.select().from(s.permissions);

  for (const r of ROLES) {
    await db
      .insert(s.roles)
      .values({ code: r.code, nameLo: r.nameLo, nameEn: r.nameEn, scope: r.scope, isSystem: true })
      .onConflictDoNothing({ target: s.roles.code });
    const [role] = await db.select().from(s.roles).where(eq(s.roles.code, r.code));
    const existing = await db.$count(s.rolePermissions, eq(s.rolePermissions.roleId, role.id));
    // Fill a role's permissions only when it has none (super_admin always gets all),
    // so edits made in the app survive a re-seed.
    if (existing === 0 || r.permissions === '*') {
      const wanted = r.permissions === '*' ? allPerms : allPerms.filter((p) => (r.permissions as string[]).includes(p.code));
      if (wanted.length) {
        await db
          .insert(s.rolePermissions)
          .values(wanted.map((p) => ({ roleId: role.id, permissionId: p.id })))
          .onConflictDoNothing();
      }
    }
  }

  await db.insert(s.leaveTypes).values(LEAVE_TYPES).onConflictDoNothing({ target: s.leaveTypes.code });
  await db.insert(s.companySettings).values({ id: 1, ...DEFAULT_SETTINGS }).onConflictDoNothing();

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
