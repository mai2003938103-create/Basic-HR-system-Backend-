import type { Db } from '../models/prisma.js';
import { conflict } from './errors.js';

export async function isSuperAdmin(tx: Db, userId: string) {
  return (await tx.userRole.count({ where: { userId, role: { code: 'super_admin' } } })) > 0;
}

/** Throws 409 unless another active super admin exists besides `userId`. */
export async function assertOtherSuperAdmin(tx: Db, userId: string) {
  const n = await tx.user.count({ where: { isActive: true, id: { not: userId }, roles: { some: { role: { code: 'super_admin' } } } } });
  if (n === 0) throw conflict('errors.role.lastSuperAdmin');
}
