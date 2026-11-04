import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Db } from './prisma.js';

export const listWithPermissions = (db: Db = prisma) =>
  db.role.findMany({ orderBy: { code: 'asc' }, include: { permissions: { include: { permission: { select: { code: true } } } }, _count: { select: { users: true } } } });
export type RoleWithPermissions = Awaited<ReturnType<typeof listWithPermissions>>[number];

export const findByCodes = (codes: string[], db: Db = prisma) => db.role.findMany({ where: { code: { in: codes } } });
export const findById = (id: string, db: Db = prisma) => db.role.findUnique({ where: { id } });

/** Ids (among `ids`) of roles that carry role.manage. */
export const withRoleManage = async (ids: string[], db: Db = prisma) =>
  ids.length ? (await db.rolePermission.findMany({ where: { roleId: { in: ids }, permission: { code: 'role.manage' } }, select: { roleId: true } })).map((r) => r.roleId) : [];

export const listPermissions = (db: Db = prisma) => db.permission.findMany({ select: { code: true, module: true }, orderBy: [{ module: 'asc' }, { code: 'asc' }] });
export const findPermissions = (codes: string[], db: Db = prisma) => (codes.length ? db.permission.findMany({ where: { code: { in: codes } } }) : Promise.resolve([]));

export const create = (data: Prisma.RoleCreateInput, db: Db = prisma) => db.role.create({ data });
export const update = (id: string, data: Prisma.RoleUpdateInput, db: Db = prisma) => db.role.update({ where: { id }, data });

export async function replacePermissions(roleId: string, permissionIds: string[], db: Db = prisma) {
  await db.rolePermission.deleteMany({ where: { roleId } });
  if (permissionIds.length) await db.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId, permissionId })) });
}
