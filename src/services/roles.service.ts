import type { z } from 'zod';
import * as roles from '../models/role.model.js';
import { prisma, type Db } from '../models/prisma.js';
import type { AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { lockRows } from '../utils/lock.js';
import type { roleBody, roleUpdateBody } from '../validators/roles.validator.js';
import { roleView } from '../views/role.view.js';

export const list = async () => (await roles.listWithPermissions()).map(roleView);

/** Roles a user manager may grant; roles carrying role.manage only for role.manage holders. */
export async function assignable(auth: AuthContext) {
  const all = await list();
  const canGrantAdmin = auth.permissions.has('role.manage');
  return all
    .filter((r) => canGrantAdmin || !r.permissionCodes.includes('role.manage'))
    .map(({ id, code, nameLo, nameEn, scope }) => ({ id, code, nameLo, nameEn, scope }));
}

export const listPermissions = () => roles.listPermissions();

async function setPermissions(tx: Db, roleId: string, codes: string[]) {
  const perms = await roles.findPermissions(codes, tx);
  if (perms.length !== new Set(codes).size) throw badRequest('errors.role.invalidPermission', [{ field: 'permissionCodes', message: 'errors.role.invalidPermission' }]);
  await roles.replacePermissions(roleId, perms.map((p) => p.id), tx);
}

export async function create(auth: AuthContext, body: z.infer<typeof roleBody>) {
  const id = await prisma.$transaction(async (tx) => {
    const r = await roles.create({ code: body.code, nameLo: body.nameLo, nameEn: body.nameEn, scope: body.scope }, tx);
    await setPermissions(tx, r.id, body.permissionCodes);
    await audit(tx, auth, { action: 'role.create', entity: 'role', entityId: r.id, after: body });
    return r.id;
  });
  return (await list()).find((r) => r.id === id)!;
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof roleUpdateBody>) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockRows(tx, 'roles', [id])).length) throw notFound();
    const before = (await roles.findById(id, tx))!;
    if (before.code === 'super_admin') throw conflict('errors.role.superAdminLocked');
    const { permissionCodes, ...rest } = body;
    if (Object.keys(rest).length) await roles.update(id, rest, tx);
    if (permissionCodes) await setPermissions(tx, id, permissionCodes);
    await audit(tx, auth, { action: 'role.update', entity: 'role', entityId: id, before, after: body });
  });
  return (await list()).find((r) => r.id === id)!;
}
