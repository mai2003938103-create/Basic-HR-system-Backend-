import { asc, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, type Tx } from '../../db/client.js';
import * as s from '../../db/schema.js';
import type { AuthContext } from '../../lib/auth-context.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { requiredText } from '../../lib/http.js';

export const roleBody = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/, 'errors.validation.code'),
  nameLo: requiredText(),
  nameEn: requiredText(),
  scope: z.enum(['all', 'department', 'self']),
  permissionCodes: z.array(z.string()),
});
export const roleUpdateBody = roleBody.omit({ code: true }).partial();

async function toDtos() {
  const roles = await db.query.roles.findMany({
    orderBy: asc(s.roles.code),
    with: { permissions: { with: { permission: { columns: { code: true } } } } },
  });
  const counts = await db.select({ roleId: s.userRoles.roleId, n: count() }).from(s.userRoles).groupBy(s.userRoles.roleId);
  const byRole = new Map(counts.map((c) => [c.roleId, c.n]));
  return roles.map((r) => ({
    id: r.id,
    code: r.code,
    nameLo: r.nameLo,
    nameEn: r.nameEn,
    scope: r.scope,
    isSystem: r.isSystem,
    permissionCodes: r.permissions.map((p) => p.permission.code).sort(),
    userCount: byRole.get(r.id) ?? 0,
  }));
}

export const list = toDtos;
export const listPermissions = () => db.select({ code: s.permissions.code, module: s.permissions.module }).from(s.permissions).orderBy(asc(s.permissions.module), asc(s.permissions.code));

async function setPermissions(tx: Tx, roleId: string, codes: string[]) {
  const perms = codes.length ? await tx.select().from(s.permissions).where(inArray(s.permissions.code, codes)) : [];
  if (perms.length !== new Set(codes).size) throw badRequest('errors.role.invalidPermission', [{ field: 'permissionCodes', message: 'errors.role.invalidPermission' }]);
  await tx.delete(s.rolePermissions).where(eq(s.rolePermissions.roleId, roleId));
  if (perms.length) await tx.insert(s.rolePermissions).values(perms.map((p) => ({ roleId, permissionId: p.id })));
}

export async function create(auth: AuthContext, body: z.infer<typeof roleBody>) {
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(s.roles).values({ code: body.code, nameLo: body.nameLo, nameEn: body.nameEn, scope: body.scope }).returning();
    await setPermissions(tx, r.id, body.permissionCodes);
    await audit(tx, auth, { action: 'role.create', entity: 'role', entityId: r.id, after: body });
    return r.id;
  });
  return (await toDtos()).find((r) => r.id === id)!;
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof roleUpdateBody>) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.roles).where(eq(s.roles.id, id)).for('update');
    if (!before) throw notFound();
    if (before.code === 'super_admin') throw conflict('errors.role.superAdminLocked');
    const { permissionCodes, ...rest } = body;
    if (Object.keys(rest).length) await tx.update(s.roles).set(rest).where(eq(s.roles.id, id));
    if (permissionCodes) await setPermissions(tx, id, permissionCodes);
    await audit(tx, auth, { action: 'role.update', entity: 'role', entityId: id, before, after: body });
  });
  return (await toDtos()).find((r) => r.id === id)!;
}
