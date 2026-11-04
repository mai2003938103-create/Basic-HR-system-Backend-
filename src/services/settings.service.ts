import { findSettings, holidayDates, type SettingsRow } from '../models/settings.model.js';
import { mergePayrollConfig } from '../modules/payroll/config.js';

export type Settings = SettingsRow;
let cache: { value: Settings; at: number } | undefined;
const TTL = 60_000;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL && process.env.NODE_ENV !== 'test') return cache.value;
  const row = await findSettings();
  if (!row) throw new Error('company_settings row missing — run the seed');
  cache = { value: row, at: Date.now() };
  return row;
}

export const invalidateSettings = () => {
  cache = undefined;
};

/** Everything HR can edit; payroll rules are merged over the defaults. */
export async function fullSettings() {
  const { payrollConfig, notificationConfig: _n, createdAt: _c, updatedAt: _u, id: _id, ...rest } = await getSettings();
  return { ...rest, payroll: mergePayrollConfig(payrollConfig) };
}

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
  return new Set(await holidayDates(from, to));
}
