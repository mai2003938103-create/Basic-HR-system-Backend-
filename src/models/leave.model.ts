import type { LeaveBalance, LeaveRequest, Prisma } from '../generated/prisma/client.js';
import { fromDateString, toDateString } from './mappers.js';
import { prisma, type Db } from './prisma.js';

export type LeaveRequestRow = Omit<LeaveRequest, 'startDate' | 'endDate' | 'days'> & { startDate: string; endDate: string; days: number };
export const toLeaveRow = (r: LeaveRequest): LeaveRequestRow => ({ ...r, startDate: toDateString(r.startDate)!, endDate: toDateString(r.endDate)!, days: r.days.toNumber() });

export const requestInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, departmentId: true, department: { select: { managerId: true } } } },
  leaveType: { select: { id: true, code: true, nameLo: true, nameEn: true } },
  approver: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.LeaveRequestInclude;
export type LeaveRequestWithRelations = Prisma.LeaveRequestGetPayload<{ include: typeof requestInclude }>;

export const findWithRelations = (id: string, db: Db = prisma) => db.leaveRequest.findUnique({ where: { id }, include: requestInclude });

export async function list(where: Prisma.LeaveRequestWhereInput, orderBy: Prisma.LeaveRequestOrderByWithRelationInput[], skip: number, take: number, db: Db = prisma) {
  const [rows, total] = await Promise.all([db.leaveRequest.findMany({ where, orderBy, skip, take, include: requestInclude }), db.leaveRequest.count({ where })]);
  return { rows, total };
}

export const findById = async (id: string, db: Db = prisma) => {
  const r = await db.leaveRequest.findUnique({ where: { id } });
  return r ? toLeaveRow(r) : null;
};

export const hasOverlap = async (employeeId: string, startDate: string, endDate: string, db: Db = prisma) =>
  !!(await db.leaveRequest.findFirst({
    where: { employeeId, status: { in: ['pending', 'approved'] }, startDate: { lte: fromDateString(endDate) }, endDate: { gte: fromDateString(startDate) } },
    select: { id: true },
  }));

export const create = async (
  data: { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; halfDay: 'none' | 'morning' | 'afternoon'; reason: string; days: number; documentUrl: string | null; approverId: string | null },
  db: Db = prisma,
) => toLeaveRow(await db.leaveRequest.create({ data: { ...data, days: String(data.days), startDate: fromDateString(data.startDate), endDate: fromDateString(data.endDate) } }));

export const update = async (id: string, data: Prisma.LeaveRequestUncheckedUpdateInput, db: Db = prisma) => toLeaveRow(await db.leaveRequest.update({ where: { id }, data }));

export const ownerOfDocument = (documentUrl: string, db: Db = prisma) =>
  db.leaveRequest.findFirst({ where: { documentUrl }, select: { employeeId: true, employee: { select: { departmentId: true } } } });

// ---- balances ----
export type LeaveBalanceRow = Omit<LeaveBalance, 'entitledDays' | 'usedDays'> & { entitledDays: number; usedDays: number };
export const toBalanceRow = (b: LeaveBalance): LeaveBalanceRow => ({ ...b, entitledDays: b.entitledDays.toNumber(), usedDays: b.usedDays.toNumber() });

export async function ensureBalance(employeeId: string, leaveTypeId: string, year: number, entitledDays: Prisma.Decimal, db: Db = prisma) {
  await db.leaveBalance.createMany({ data: [{ employeeId, leaveTypeId, year, entitledDays }], skipDuplicates: true });
  return toBalanceRow((await db.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } } }))!);
}

export const findBalance = async (id: string, db: Db = prisma) => {
  const b = await db.leaveBalance.findUnique({ where: { id } });
  return b ? toBalanceRow(b) : null;
};

export const addUsed = (id: string, days: number, db: Db = prisma) => db.leaveBalance.update({ where: { id }, data: { usedDays: { increment: days } } });

/** usedDays − days, never below 0 (former greatest(used − days, 0)). */
export async function refundUsed(id: string, days: number, db: Db = prisma) {
  const b = (await db.leaveBalance.findUnique({ where: { id } }))!;
  const next = Math.max(0, b.usedDays.toNumber() - days);
  await db.leaveBalance.update({ where: { id }, data: { usedDays: String(next) } });
}

export const setEntitled = async (id: string, entitledDays: number, db: Db = prisma) =>
  toBalanceRow(await db.leaveBalance.update({ where: { id }, data: { entitledDays: String(entitledDays) } }));
