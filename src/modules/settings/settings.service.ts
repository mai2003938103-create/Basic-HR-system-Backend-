import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';

export type Settings = typeof s.companySettings.$inferSelect;
let cache: { value: Settings; at: number } | undefined;
const TTL = 60_000;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL && process.env.NODE_ENV !== 'test') return cache.value;
  const [row] = await db.select().from(s.companySettings).where(eq(s.companySettings.id, 1));
  if (!row) throw new Error('company_settings row missing — run the seed');
  cache = { value: row, at: Date.now() };
  return row;
}

export const invalidateSettings = () => {
  cache = undefined;
};

export async function publicSettings() {
  const st = await getSettings();
  return {
    companyNameLo: st.companyNameLo,
    companyNameEn: st.companyNameEn,
    logoUrl: st.logoUrl,
    currencyCode: st.currencyCode,
    currencySymbol: st.currencySymbol,
    workingDays: st.workingDays,
    workStart: st.workStart,
    workEnd: st.workEnd,
  };
}

/** Holiday dates between two YYYY-MM-DD dates (inclusive). */
export async function holidaySet(from: string, to: string): Promise<Set<string>> {
  const rows = await db.select({ date: s.holidays.date }).from(s.holidays).where(and(gte(s.holidays.date, from), lte(s.holidays.date, to)));
  return new Set(rows.map((r) => r.date));
}
