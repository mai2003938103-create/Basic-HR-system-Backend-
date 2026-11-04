import type { CompanySettings } from '../generated/prisma/client.js';
import { jsonArray, toDateString } from './mappers.js';
import { prisma, type Db } from './prisma.js';

export type SettingsRow = Omit<CompanySettings, 'workingDays'> & { workingDays: number[] };

export async function findSettings(db: Db = prisma): Promise<SettingsRow | null> {
  const row = await db.companySettings.findUnique({ where: { id: 1 } });
  return row ? { ...row, workingDays: jsonArray<number>(row.workingDays) } : null;
}

export const holidayDates = async (from: string, to: string, db: Db = prisma) =>
  (await db.holiday.findMany({ where: { date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }, select: { date: true } })).map((h) => toDateString(h.date)!);

export const updateSettings = (data: import('../generated/prisma/client.js').Prisma.CompanySettingsUpdateInput, db: Db = prisma) => db.companySettings.update({ where: { id: 1 }, data });
