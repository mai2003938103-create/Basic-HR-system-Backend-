import type { z } from 'zod';
import { env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Db } from '../models/prisma.js';
import * as roles from '../models/role.model.js';
import * as users from '../models/user.model.js';
import type { AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { likeEscape } from '../utils/http.js';
import { page, toPaging } from '../utils/list-query.js';
import { lockRows } from '../utils/lock.js';
import { hashPassword } from '../utils/password.js';
import { assertOtherSuperAdmin, isSuperAdmin } from '../utils/super-admin.js';
import type { createUserBody, listUsersQuery, updateUserBody } from '../validators/users.validator.js';
import { userView } from '../views/user.view.js';
import { createResetToken, revokeAll } from './auth.service.js';

async function toDtos(ids: string[]) {
  if (!ids.length) return [];
  const byId = new Map((await users.findDtos(ids)).map((u) => [u.id, userView(u)]));
  return ids.map((id) => byId.get(id)!);
}

export async function list(q: z.infer<typeof listUsersQuery>) {
  const where: Prisma.UserWhereInput = {};
  // Case-insensitive through the column collation; % and _ in the search are literal.
  if (q.search) where.email = { contains: likeEscape(q.search) };
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.role) where.roles = { some: { role: { code: q.role } } };
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const { ids, total } = await users.list(where, [{ [sortField]: sortDir }, { id: 'asc' }], offset, limit);
  return page(await toDtos(ids), total, q);
}

export async function get(id: string) {
  const [dto] = await toDtos([id]);
  if (!dto) throw notFound();
  return dto;
}

async function resolveRoles(tx: Db, auth: AuthContext, codes: string[]) {
  const found = await roles.findByCodes(codes, tx);
  if (found.length !== new Set(codes).size) throw badRequest('errors.user.invalidRole', [{ field: 'roleCodes', message: 'errors.user.invalidRole' }]);
  if (!auth.permissions.has('role.manage') && (await roles.withRoleManage(found.map((r) => r.id), tx)).length) throw forbidden();
  return found;
}

async function assertEmployeeFree(tx: Db, employeeId: string | null | undefined, userId?: string) {
  if (!employeeId) return;
  if (!(await tx.employee.findUnique({ where: { id: employeeId }, select: { id: true } }))) {
    throw badRequest('errors.user.invalidEmployee', [{ field: 'employeeId', message: 'errors.user.invalidEmployee' }]);
  }
  const taken = await users.findByEmployee(employeeId, tx);
  if (taken && taken.id !== userId) throw conflict('errors.user.employeeHasAccount');
}

export async function create(auth: AuthContext, body: z.infer<typeof createUserBody>) {
  const id = await prisma.$transaction(async (tx) => {
    const found = await resolveRoles(tx, auth, body.roleCodes);
    await assertEmployeeFree(tx, body.employeeId);
    const u = await users.create(
      { email: body.email, passwordHash: await hashPassword(body.password), employeeId: body.employeeId ?? null, mustChangePassword: true, roleIds: found.map((r) => r.id) },
      tx,
    );
    await audit(tx, auth, { action: 'user.create', entity: 'user', entityId: u.id, after: { email: body.email, roles: body.roleCodes } });
    return u.id;
  });
  return get(id);
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof updateUserBody>) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockRows(tx, 'users', [id])).length) throw notFound();
    const before = (await users.findById(id, tx))!;
    const wasSa = await isSuperAdmin(tx, id);
    if (wasSa && !auth.permissions.has('role.manage')) throw forbidden();
    if (body.employeeId !== undefined) await assertEmployeeFree(tx, body.employeeId, id);
    const set: Prisma.UserUncheckedUpdateInput = {};
    if (body.email) set.email = body.email;
    if (body.employeeId !== undefined) set.employeeId = body.employeeId ?? null;
    if (Object.keys(set).length) await users.update(id, set, tx);
    if (body.roleCodes) {
      const found = await resolveRoles(tx, auth, body.roleCodes);
      if (wasSa && !body.roleCodes.includes('super_admin')) await assertOtherSuperAdmin(tx, id);
      await users.replaceRoles(id, found.map((r) => r.id), tx);
    }
    await audit(tx, auth, { action: 'user.update', entity: 'user', entityId: id, before: { email: before.email }, after: body });
  });
  return get(id);
}

export async function setStatus(auth: AuthContext, id: string, isActive: boolean) {
  if (id === auth.userId && !isActive) throw badRequest('errors.user.cannotDeactivateSelf');
  await prisma.$transaction(async (tx) => {
    if (!(await lockRows(tx, 'users', [id])).length) throw notFound();
    const before = (await users.findById(id, tx))!;
    if (await isSuperAdmin(tx, id)) {
      if (!auth.permissions.has('role.manage')) throw forbidden();
      if (!isActive) await assertOtherSuperAdmin(tx, id);
    }
    await users.update(id, { isActive }, tx);
    await audit(tx, auth, { action: 'user.status', entity: 'user', entityId: id, before: { isActive: before.isActive }, after: { isActive } });
  });
  if (!isActive) await revokeAll(id);
  return get(id);
}

export async function resetLink(auth: AuthContext, id: string) {
  if (!(await users.findById(id))) throw notFound();
  if ((await isSuperAdmin(prisma, id)) && !auth.permissions.has('role.manage')) throw forbidden();
  const { token, expiresAt } = await createResetToken(id);
  await audit(prisma, auth, { action: 'user.resetLink', entity: 'user', entityId: id });
  return { url: `${env.CORS_ORIGIN.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`, expiresAt };
}
