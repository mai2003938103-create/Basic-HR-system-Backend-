import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Db } from './prisma.js';

export const list = (db: Db = prisma) => db.leaveType.findMany({ orderBy: { code: 'asc' } });
export const listActive = (db: Db = prisma) => db.leaveType.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
export const findById = (id: string, db: Db = prisma) => db.leaveType.findUnique({ where: { id } });
export const findActive = (id: string, db: Db = prisma) => db.leaveType.findFirst({ where: { id, isActive: true } });
export const create = (data: Prisma.LeaveTypeCreateInput, db: Db = prisma) => db.leaveType.create({ data });
export const update = (id: string, data: Prisma.LeaveTypeUpdateInput, db: Db = prisma) => db.leaveType.update({ where: { id }, data });
