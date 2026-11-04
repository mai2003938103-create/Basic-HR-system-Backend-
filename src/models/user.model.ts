import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Db } from './prisma.js';

/** Columns and relations every user DTO needs (never the password hash). */
export const userDtoSelect = {
  id: true,
  email: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  employeeId: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  roles: { select: { role: { select: { code: true } } } },
} satisfies Prisma.UserSelect;
export type UserDtoRow = Prisma.UserGetPayload<{ select: typeof userDtoSelect }>;

export const findByEmail = (email: string, db: Db = prisma) => db.user.findUnique({ where: { email } });
export const findById = (id: string, db: Db = prisma) => db.user.findUnique({ where: { id } });
export const findByEmployee = (employeeId: string, db: Db = prisma) => db.user.findUnique({ where: { employeeId } });

export const findDtos = (ids: string[], db: Db = prisma) => db.user.findMany({ where: { id: { in: ids } }, select: userDtoSelect });

export async function list(where: Prisma.UserWhereInput, orderBy: Prisma.UserOrderByWithRelationInput[], skip: number, take: number, db: Db = prisma) {
  const [rows, total] = await Promise.all([db.user.findMany({ where, orderBy, skip, take, select: { id: true } }), db.user.count({ where })]);
  return { ids: rows.map((r) => r.id), total };
}

export const findMe = (id: string, db: Db = prisma) =>
  db.user.findUnique({
    where: { id },
    select: { id: true, email: true, mustChangePassword: true, employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, departmentId: true } } },
  });

export const update = (id: string, data: Prisma.UserUncheckedUpdateInput, db: Db = prisma) => db.user.update({ where: { id }, data });

export const create = (data: { email: string; passwordHash: string; employeeId: string | null; mustChangePassword: boolean; roleIds: string[] }, db: Db = prisma) =>
  db.user.create({
    data: { email: data.email, passwordHash: data.passwordHash, employeeId: data.employeeId, mustChangePassword: data.mustChangePassword, roles: { create: data.roleIds.map((roleId) => ({ roleId })) } },
    select: { id: true },
  });

export async function replaceRoles(userId: string, roleIds: string[], db: Db = prisma) {
  await db.userRole.deleteMany({ where: { userId } });
  await db.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
}
