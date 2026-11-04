import type { Holiday } from '../generated/prisma/client.js';
import { fromDateString, toDateString } from './mappers.js';
import { prisma, type Db } from './prisma.js';

export type HolidayRow = Omit<Holiday, 'date'> & { date: string };
const toRow = (h: Holiday): HolidayRow => ({ ...h, date: toDateString(h.date)! });

export const listYear = async (year: number, db: Db = prisma) =>
  (await db.holiday.findMany({ where: { date: { gte: fromDateString(`${year}-01-01`), lte: fromDateString(`${year}-12-31`) } }, orderBy: { date: 'asc' } })).map(toRow);
export const create = async (data: { date: string; nameLo: string; nameEn: string }, db: Db = prisma) => toRow(await db.holiday.create({ data: { ...data, date: fromDateString(data.date) } }));
export const findById = async (id: string, db: Db = prisma) => {
  const h = await db.holiday.findUnique({ where: { id } });
  return h ? toRow(h) : null;
};
export const remove = (id: string, db: Db = prisma) => db.holiday.delete({ where: { id } });
