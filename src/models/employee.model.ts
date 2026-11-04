import type { Employee, Prisma } from '../generated/prisma/client.js';
import { decimalString, fromDateString, toDateString } from './mappers.js';
import { prisma, type Db } from './prisma.js';

/** Employee in its Stage 1 shape: calendar dates as 'YYYY-MM-DD', basicSalary as a 2-decimal string. */
export type EmployeeRow = Omit<Employee, 'dateOfBirth' | 'hireDate' | 'endDate' | 'basicSalary'> & {
  dateOfBirth: string;
  hireDate: string;
  endDate: string | null;
  basicSalary: string;
};

export const toEmployeeRow = (e: Employee): EmployeeRow => ({
  ...e,
  dateOfBirth: toDateString(e.dateOfBirth)!,
  hireDate: toDateString(e.hireDate)!,
  endDate: toDateString(e.endDate),
  basicSalary: decimalString(e.basicSalary, 2)!,
});

/** Stage 1 style input (dates as strings) → Prisma data. */
type DateFields = 'dateOfBirth' | 'hireDate' | 'endDate';
export type EmployeeInput = Partial<Omit<EmployeeRow, DateFields | 'id' | 'createdAt' | 'updatedAt'>> & { dateOfBirth?: string; hireDate?: string; endDate?: string | null };
function toData(v: EmployeeInput) {
  const { dateOfBirth, hireDate, endDate, ...rest } = v;
  return {
    ...rest,
    ...(dateOfBirth !== undefined ? { dateOfBirth: fromDateString(dateOfBirth) } : {}),
    ...(hireDate !== undefined ? { hireDate: fromDateString(hireDate) } : {}),
    ...(endDate !== undefined ? { endDate: endDate === null ? null : fromDateString(endDate) } : {}),
  };
}

export async function list(where: Prisma.EmployeeWhereInput, orderBy: Prisma.EmployeeOrderByWithRelationInput[], skip: number, take: number, db: Db = prisma) {
  const [rows, total] = await Promise.all([db.employee.findMany({ where, orderBy, skip, take }), db.employee.count({ where })]);
  return { rows: rows.map(toEmployeeRow), total };
}

export const findById = async (id: string, db: Db = prisma) => {
  const e = await db.employee.findUnique({ where: { id } });
  return e ? toEmployeeRow(e) : null;
};

export const create = async (data: EmployeeInput, db: Db = prisma) =>
  toEmployeeRow(await db.employee.create({ data: toData(data) as Prisma.EmployeeUncheckedCreateInput }));

export const update = async (id: string, data: EmployeeInput, db: Db = prisma) =>
  toEmployeeRow(await db.employee.update({ where: { id }, data: toData(data) as Prisma.EmployeeUncheckedUpdateInput }));

/** Departments, positions and login accounts for a page of employees. */
export async function extras(rows: EmployeeRow[], db: Db = prisma) {
  if (rows.length === 0) return { depts: new Map(), positions: new Map(), users: new Map() };
  const [depts, positions, users] = await Promise.all([
    db.department.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.departmentId))] } }, select: { id: true, code: true, nameLo: true, nameEn: true } }),
    db.position.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.positionId))] } }, select: { id: true, code: true, nameLo: true, nameEn: true } }),
    db.user.findMany({
      where: { employeeId: { in: rows.map((r) => r.id) } },
      select: { id: true, email: true, isActive: true, employeeId: true, roles: { select: { role: { select: { code: true } } } } },
    }),
  ]);
  return {
    depts: new Map(depts.map((d) => [d.id, d])),
    positions: new Map(positions.map((p) => [p.id, p])),
    users: new Map(users.map((u) => [u.employeeId!, { id: u.id, email: u.email, isActive: u.isActive, roles: u.roles.map((r) => r.role.code).sort() }])),
  };
}
export type EmployeeExtras = Awaited<ReturnType<typeof extras>>;
