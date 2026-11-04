import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Db } from './prisma.js';

export const listTypes = (db: Db = prisma) => db.allowanceType.findMany({ orderBy: { code: 'asc' } });
export const findType = (id: string, db: Db = prisma) => db.allowanceType.findUnique({ where: { id } });
export const countTypes = (ids: string[], db: Db = prisma) => db.allowanceType.count({ where: { id: { in: ids } } });
export const createType = (data: Prisma.AllowanceTypeCreateInput, db: Db = prisma) => db.allowanceType.create({ data });
export const updateType = (id: string, data: Prisma.AllowanceTypeUpdateInput, db: Db = prisma) => db.allowanceType.update({ where: { id }, data });

export const forEmployee = (employeeId: string, db: Db = prisma) =>
  db.employeeAllowance.findMany({ where: { employeeId }, include: { type: true }, orderBy: { type: { code: 'asc' } } });
export type EmployeeAllowanceWithType = Awaited<ReturnType<typeof forEmployee>>[number];

export async function replaceForEmployee(employeeId: string, items: [string, number][], db: Db = prisma) {
  await db.employeeAllowance.deleteMany({ where: { employeeId } });
  if (items.length) await db.employeeAllowance.createMany({ data: items.map(([allowanceTypeId, amount]) => ({ employeeId, allowanceTypeId, amount })) });
}
