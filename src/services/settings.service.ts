import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../models/prisma.js';
import { findSettings, holidayDates, updateSettings, type SettingsRow } from '../models/settings.model.js';
import type { AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { calculatePayItem } from './payroll/calc.js';
import { getPayrollConfig, mergePayrollConfig, type PayrollConfig } from './payroll/config.js';

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

type FullSettings = Awaited<ReturnType<typeof fullSettings>>;

/** Saves one settings section in a transaction with an audit entry; every write clears the cache. */
async function save(auth: AuthContext, action: string, body: unknown, toData: (before: FullSettings) => Prisma.CompanySettingsUpdateInput) {
  const before = await fullSettings();
  await prisma.$transaction(async (tx) => {
    await updateSettings(toData(before), tx);
    invalidateSettings();
    await audit(tx, auth, { action, entity: 'company_settings', entityId: '1', before, after: body });
  });
  invalidateSettings();
  return fullSettings();
}

export const saveCompany = (auth: AuthContext, body: Prisma.CompanySettingsUpdateInput) => save(auth, 'settings.company', body, () => body);
export const saveWorkTime = (auth: AuthContext, body: Omit<Prisma.CompanySettingsUpdateInput, 'workingDays'> & { workingDays: number[] }) =>
  save(auth, 'settings.workTime', body, () => body);
/** Any change to the rules makes them unconfirmed again. */
export const savePayroll = (auth: AuthContext, body: Omit<PayrollConfig, 'confirmedBy' | 'confirmedAt'>) =>
  save(auth, 'settings.payroll', body, () => ({ payrollConfig: { ...body, confirmedBy: null, confirmedAt: null } }));
export const confirmPayroll = (auth: AuthContext) =>
  save(auth, 'settings.payrollConfirm', undefined, (before) => ({ payrollConfig: { ...before.payroll, confirmedBy: auth.userId, confirmedAt: new Date().toISOString() } }));

/** One salary with no allowances or overtime under the current rules. */
export async function preview(gross: number) {
  const cfg = await getPayrollConfig();
  return calculatePayItem(
    { basic: gross, periodWorkDays: cfg.workDaysPerMonth, paidWorkDays: cfg.workDaysPerMonth, allowances: [], overtimeMinutesWeekday: 0, overtimeMinutesRestday: 0, bonus: 0, otherDeduction: 0, unpaidDays: 0 },
    cfg,
  );
}
