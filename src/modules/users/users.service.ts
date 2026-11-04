import { and, asc, count, desc, eq, ilike, inArray, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { db, type DbOrTx, type Tx } from '../../db/client.js';
import * as s from '../../db/schema.js';
import type { AuthContext } from '../../utils/auth-context.js';
import { audit } from '../../utils/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { likeEscape } from '../../utils/http.js';
import { page, toPaging } from '../../utils/list-query.js';
import { hashPassword } from '../../utils/password.js';
import { createResetToken, revokeAll } from '../auth/auth.service.js';
import { assertOtherSuperAdmin, isSuperAdmin } from '../../utils/super-admin.js';
import type { createUserBody, listUsersQuery, updateUserBody } from './users.schema.js';

async function toDtos(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.query.users.findMany({
    where: inArray(s.users.id, ids),
    columns: { passwordHash: false },
    with: {
      employee: { columns: { id: true, employeeCode: true, firstName: true, lastName: true } },
      roles: { with: { role: { columns: { code: true } } } },
    },
  });
  const byId = new Map(rows.map((u) => [u.id, { ...u, roles: u.roles.map((r) => r.role.code).sort() }]));
  return ids.map((id) => byId.get(id)!);
}

export async function list(q: z.infer<typeof listUsersQuery>) {
  const conds: (SQL | undefined)[] = [];
  if (q.search) conds.push(ilike(s.users.email, `%${likeEscape(q.search)}%`));
  if (q.isActive !== undefined) conds.push(eq(s.users.isActive, q.isActive));
  if (q.role) {
    conds.push(
      inArray(
        s.users.id,
        db.select({ id: s.userRoles.userId }).from(s.userRoles).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId)).where(eq(s.roles.code, q.role)),
      ),
    );
  }
  const where = and(...conds);
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const col = s.users[sortField as 'email'];
  const rows = await db.select({ id: s.users.id }).from(s.users).where(where).orderBy(sortDir === 'asc' ? asc(col) : desc(col), asc(s.users.id)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(s.users).where(where);
  return page(await toDtos(rows.map((r) => r.id)), total, q);
}

export async function get(id: string) {
  const [dto] = await toDtos([id]);
  if (!dto) throw notFound();
  return dto;
}

/** Roles (among `ids`) that carry role.manage — only role.manage holders may grant them. */
export async function rolesWithRoleManage(tx: DbOrTx, ids: string[]) {
  if (!ids.length) return [];
  return tx
    .select({ id: s.rolePermissions.roleId })
    .from(s.rolePermissions)
    .innerJoin(s.permissions, eq(s.permissions.id, s.rolePermissions.permissionId))
    .where(and(inArray(s.rolePermissions.roleId, ids), eq(s.permissions.code, 'role.manage')));
}

async function resolveRoles(tx: Tx, auth: AuthContext, codes: string[]) {
  const roles = await tx.select().from(s.roles).where(inArray(s.roles.code, codes));
  if (roles.length !== new Set(codes).size) throw badRequest('errors.user.invalidRole', [{ field: 'roleCodes', message: 'errors.user.invalidRole' }]);
  if (!auth.permissions.has('role.manage') && (await rolesWithRoleManage(tx, roles.map((r) => r.id))).length) throw forbidden();
  return roles;
}

async function assertEmployeeFree(tx: Tx, employeeId: string | null | undefined, userId?: string) {
  if (!employeeId) return;
  const [e] = await tx.select({ id: s.employees.id }).from(s.employees).where(eq(s.employees.id, employeeId));
  if (!e) throw badRequest('errors.user.invalidEmployee', [{ field: 'employeeId', message: 'errors.user.invalidEmployee' }]);
  const [taken] = await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.employeeId, employeeId));
  if (taken && taken.id !== userId) throw conflict('errors.user.employeeHasAccount');
}

export async function create(auth: AuthContext, body: z.infer<typeof createUserBody>) {
  const id = await db.transaction(async (tx) => {
    const roles = await resolveRoles(tx, auth, body.roleCodes);
    await assertEmployeeFree(tx, body.employeeId);
    const [u] = await tx
      .insert(s.users)
      .values({ email: body.email, passwordHash: await hashPassword(body.password), employeeId: body.employeeId ?? null, mustChangePassword: true })
      .returning({ id: s.users.id });
    await tx.insert(s.userRoles).values(roles.map((r) => ({ userId: u.id, roleId: r.id })));
    await audit(tx, auth, { action: 'user.create', entity: 'user', entityId: u.id, after: { email: body.email, roles: body.roleCodes } });
    return u.id;
  });
  return get(id);
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof updateUserBody>) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.users).where(eq(s.users.id, id)).for('update');
    if (!before) throw notFound();
    const wasSa = await isSuperAdmin(tx, id);
    if (wasSa && !auth.permissions.has('role.manage')) throw forbidden();
    if (body.employeeId !== undefined) await assertEmployeeFree(tx, body.employeeId, id);
    const set: Partial<typeof s.users.$inferInsert> = {};
    if (body.email) set.email = body.email;
    if (body.employeeId !== undefined) set.employeeId = body.employeeId ?? null;
    if (Object.keys(set).length) await tx.update(s.users).set(set).where(eq(s.users.id, id));
    if (body.roleCodes) {
      const roles = await resolveRoles(tx, auth, body.roleCodes);
      if (wasSa && !body.roleCodes.includes('super_admin')) await assertOtherSuperAdmin(tx, id);
      await tx.delete(s.userRoles).where(eq(s.userRoles.userId, id));
      await tx.insert(s.userRoles).values(roles.map((r) => ({ userId: id, roleId: r.id })));
    }
    await audit(tx, auth, { action: 'user.update', entity: 'user', entityId: id, before: { email: before.email }, after: body });
  });
  return get(id);
}

export async function setStatus(auth: AuthContext, id: string, isActive: boolean) {
  if (id === auth.userId && !isActive) throw badRequest('errors.user.cannotDeactivateSelf');
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.users).where(eq(s.users.id, id)).for('update');
    if (!before) throw notFound();
    if (await isSuperAdmin(tx, id)) {
      if (!auth.permissions.has('role.manage')) throw forbidden();
      if (!isActive) await assertOtherSuperAdmin(tx, id);
    }
    await tx.update(s.users).set({ isActive }).where(eq(s.users.id, id));
    await audit(tx, auth, { action: 'user.status', entity: 'user', entityId: id, before: { isActive: before.isActive }, after: { isActive } });
  });
  if (!isActive) await revokeAll(id);
  return get(id);
}

export async function resetLink(auth: AuthContext, id: string) {
  const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, id));
  if (!u) throw notFound();
  if ((await db.transaction((tx) => isSuperAdmin(tx, id))) && !auth.permissions.has('role.manage')) throw forbidden();
  const { token, expiresAt } = await createResetToken(id);
  await audit(db, auth, { action: 'user.resetLink', entity: 'user', entityId: id });
  return { url: `${env.CORS_ORIGIN.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`, expiresAt };
}

