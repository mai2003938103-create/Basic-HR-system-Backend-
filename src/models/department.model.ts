import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Db } from './prisma.js';

const ACTIVE_EMPLOYEES = { employmentStatus: { notIn: ['inactive', 'terminated'] } } satisfies Prisma.EmployeeWhereInput;

export const departmentInclude = {
  manager: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { employees: { where: ACTIVE_EMPLOYEES } } },
} satisfies Prisma.DepartmentInclude;
export type DepartmentWithManager = Prisma.DepartmentGetPayload<{ include: typeof departmentInclude }>;

export async function list(where: Prisma.DepartmentWhereInput, orderBy: Prisma.DepartmentOrderByWithRelationInput[], skip: number, take: number, db: Db = prisma) {
  const [rows, total] = await Promise.all([db.department.findMany({ where, orderBy, skip, take, include: departmentInclude }), db.department.count({ where })]);
  return { rows, total };
}

export const findWithManager = (id: string, db: Db = prisma) => db.department.findUnique({ where: { id }, include: departmentInclude });
export const findById = (id: string, db: Db = prisma) => db.department.findUnique({ where: { id } });
export const create = (data: Prisma.DepartmentUncheckedCreateInput, db: Db = prisma) => db.department.create({ data });
export const update = (id: string, data: Prisma.DepartmentUncheckedUpdateInput, db: Db = prisma) => db.department.update({ where: { id }, data });
export const remove = (id: string, db: Db = prisma) => db.department.delete({ where: { id } });
export const usage = async (id: string, db: Db = prisma) => ({
  employees: await db.employee.count({ where: { departmentId: id } }),
  positions: await db.position.count({ where: { departmentId: id } }),
});
