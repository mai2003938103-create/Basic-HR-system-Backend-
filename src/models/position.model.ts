import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Db } from './prisma.js';

export const positionInclude = {
  department: { select: { id: true, nameLo: true, nameEn: true } },
  _count: { select: { employees: { where: { employmentStatus: { notIn: ['inactive', 'terminated'] } } } } },
} satisfies Prisma.PositionInclude;
export type PositionWithDepartment = Prisma.PositionGetPayload<{ include: typeof positionInclude }>;

export async function list(where: Prisma.PositionWhereInput, orderBy: Prisma.PositionOrderByWithRelationInput[], skip: number, take: number, db: Db = prisma) {
  const [rows, total] = await Promise.all([db.position.findMany({ where, orderBy, skip, take, include: positionInclude }), db.position.count({ where })]);
  return { rows, total };
}

export const findWithDepartment = (id: string, db: Db = prisma) => db.position.findUnique({ where: { id }, include: positionInclude });
export const findById = (id: string, db: Db = prisma) => db.position.findUnique({ where: { id } });
export const create = (data: Prisma.PositionUncheckedCreateInput, db: Db = prisma) => db.position.create({ data });
export const update = (id: string, data: Prisma.PositionUncheckedUpdateInput, db: Db = prisma) => db.position.update({ where: { id }, data });
export const remove = (id: string, db: Db = prisma) => db.position.delete({ where: { id } });
export const employeeCount = (id: string, db: Db = prisma) => db.employee.count({ where: { positionId: id } });
