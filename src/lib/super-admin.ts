import { and, count, eq, ne } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import * as s from '../db/schema.js';
import { conflict } from './errors.js';

export async function isSuperAdmin(tx: DbOrTx, userId: string) {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(s.userRoles)
    .innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
    .where(and(eq(s.userRoles.userId, userId), eq(s.roles.code, 'super_admin')));
  return n > 0;
}

/** Throws 409 unless another active super admin exists besides `userId`. */
export async function assertOtherSuperAdmin(tx: DbOrTx, userId: string) {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(s.users)
    .innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id))
    .innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
    .where(and(eq(s.roles.code, 'super_admin'), eq(s.users.isActive, true), ne(s.users.id, userId)));
  if (n === 0) throw conflict('errors.role.lastSuperAdmin');
}
