import type { Attendance, Prisma } from '../generated/prisma/client.js';
import { fromDateString, toDateString } from './mappers.js';
import { prisma, type Db } from './prisma.js';

export type AttendanceRow = Omit<Attendance, 'workDate'> & { workDate: string };
export const toAttendanceRow = (a: Attendance): AttendanceRow => ({ ...a, workDate: toDateString(a.workDate)! });

export const findDay = async (employeeId: string, workDate: string, db: Db = prisma) => {
  const a = await db.attendance.findUnique({ where: { employeeId_workDate: { employeeId, workDate: fromDateString(workDate) } } });
  return a ? toAttendanceRow(a) : null;
};

export const findById = async (id: string, db: Db = prisma) => {
  const a = await db.attendance.findUnique({ where: { id }, include: { employee: { select: { departmentId: true } } } });
  return a ? { row: toAttendanceRow(a), departmentId: a.employee.departmentId } : null;
};

export const create = async (data: Omit<Prisma.AttendanceUncheckedCreateInput, 'workDate'> & { workDate: string }, db: Db = prisma) =>
  toAttendanceRow(await db.attendance.create({ data: { ...data, workDate: fromDateString(data.workDate) } }));

/** Conditional update; returns the updated row, or null when the condition no longer holds. */
export async function updateWhere(where: Prisma.AttendanceWhereInput & { id?: string }, data: Prisma.AttendanceUncheckedUpdateManyInput, db: Db = prisma) {
  const ids = (await db.attendance.findMany({ where, select: { id: true } })).map((r) => r.id);
  if (!ids.length) return null;
  const n = await db.attendance.updateMany({ where: { ...where, id: { in: ids } }, data });
  if (!n.count) return null;
  return toAttendanceRow((await db.attendance.findUnique({ where: { id: ids[0] } }))!);
}

export const update = async (id: string, data: Prisma.AttendanceUncheckedUpdateInput, db: Db = prisma) => toAttendanceRow(await db.attendance.update({ where: { id }, data }));

export const listInclude = {
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, departmentId: true, department: { select: { nameLo: true, nameEn: true } } } },
} satisfies Prisma.AttendanceInclude;
export type AttendanceWithEmployee = Prisma.AttendanceGetPayload<{ include: typeof listInclude }>;

export async function list(where: Prisma.AttendanceWhereInput, orderBy: Prisma.AttendanceOrderByWithRelationInput[], skip: number | undefined, take: number, db: Db = prisma) {
  const [rows, total] = await Promise.all([db.attendance.findMany({ where, orderBy, skip, take, include: listInclude }), db.attendance.count({ where })]);
  return { rows, total };
}

/** Marks approved full-day leave on working dates; a day the employee already checked in keeps its record. */
export async function markLeaveDays(employeeId: string, dates: string[], db: Db = prisma) {
  if (!dates.length) return;
  await db.attendance.createMany({ data: dates.map((d) => ({ employeeId, workDate: fromDateString(d), status: 'leave' as const, note: 'leave' })), skipDuplicates: true });
  await db.attendance.updateMany({ where: { employeeId, workDate: { in: dates.map(fromDateString) }, checkInAt: null }, data: { status: 'leave' } });
}

export const clearLeaveDays = (employeeId: string, from: string, to: string, db: Db = prisma) =>
  db.attendance.deleteMany({ where: { employeeId, workDate: { gte: fromDateString(from), lte: fromDateString(to) }, status: 'leave', checkInAt: null } });
