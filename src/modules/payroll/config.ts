import { z } from 'zod';
import { getSettings } from '../settings/settings.service.js';

const bracket = z.object({ upTo: z.number().int().positive().nullable(), rate: z.number().min(0).max(100) });

/** Payroll rules kept in company_settings.payroll_config (spec §4.3). Values are general defaults until the company confirms them. */
export const payrollConfigSchema = z
  .object({
    payDay: z.number().int().min(1).max(31),
    workDaysPerMonth: z.number().int().min(20).max(31),
    hoursPerDay: z.number().int().min(1).max(12),
    overtime: z.object({
      weekdayRate: z.number().min(100).max(1000),
      restDayRate: z.number().min(100).max(1000),
      thresholdMinutes: z.number().int().min(0).max(240),
      maxMinutesPerMonth: z.number().int().min(0).max(10000),
    }),
    socialSecurity: z.object({
      employeeRate: z.number().min(0).max(100),
      employerRate: z.number().min(0).max(100),
      ceiling: z.number().int().min(0),
    }),
    incomeTax: z.object({
      deductSocialSecurity: z.boolean(),
      brackets: z.array(bracket).min(1).max(20),
    }),
    proration: z.enum(['workingDays', 'none']),
    confirmedBy: z.string().uuid().nullable(),
    confirmedAt: z.string().datetime().nullable(),
  })
  .superRefine((v, ctx) => {
    const b = v.incomeTax.brackets;
    const ordered = b.every((x, i) => (i === b.length - 1 ? x.upTo === null : x.upTo !== null && (i === 0 || x.upTo > (b[i - 1].upTo as number))));
    if (!ordered) ctx.addIssue({ code: 'custom', path: ['incomeTax', 'brackets'], message: 'errors.settings.bracketOrder' });
  });

export type PayrollConfig = z.infer<typeof payrollConfigSchema>;

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  payDay: 25,
  workDaysPerMonth: 22,
  hoursPerDay: 8,
  overtime: { weekdayRate: 150, restDayRate: 250, thresholdMinutes: 30, maxMinutesPerMonth: 2700 },
  socialSecurity: { employeeRate: 5.5, employerRate: 6, ceiling: 4500000 },
  incomeTax: {
    deductSocialSecurity: true,
    brackets: [
      { upTo: 2500000, rate: 0 },
      { upTo: 5000000, rate: 5 },
      { upTo: 15000000, rate: 10 },
      { upTo: 25000000, rate: 15 },
      { upTo: 65000000, rate: 20 },
      { upTo: null, rate: 25 },
    ],
  },
  proration: 'workingDays',
  confirmedBy: null,
  confirmedAt: null,
};

/** Stored config merged over the defaults, so keys added later never come back undefined. */
export function mergePayrollConfig(stored: unknown): PayrollConfig {
  const v = (stored && typeof stored === 'object' ? stored : {}) as Partial<PayrollConfig>;
  const d = DEFAULT_PAYROLL_CONFIG;
  return {
    ...d,
    ...v,
    overtime: { ...d.overtime, ...(v.overtime ?? {}) },
    socialSecurity: { ...d.socialSecurity, ...(v.socialSecurity ?? {}) },
    incomeTax: { ...d.incomeTax, ...(v.incomeTax ?? {}) },
  };
}

export async function getPayrollConfig(): Promise<PayrollConfig> {
  return mergePayrollConfig((await getSettings()).payrollConfig);
}
