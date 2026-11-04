import { z } from 'zod';
import { optionalText, requiredText } from '../../utils/http.js';
import { payrollConfigSchema } from '../payroll/config.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'errors.validation.time');
const toMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));

export const companyBody = z.object({
  companyNameLo: requiredText(),
  companyNameEn: requiredText(),
  addressLo: optionalText,
  addressEn: optionalText,
  taxId: optionalText,
  phone: optionalText,
  email: z.string().trim().toLowerCase().email('errors.validation.email').nullish().or(z.literal('').transform(() => null)),
  currencyCode: z.string().trim().length(3, 'errors.validation.required').transform((v) => v.toUpperCase()),
  currencySymbol: requiredText(5),
});

export const workTimeBody = z
  .object({
    workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform((d) => [...new Set(d)].sort()),
    workStart: hhmm,
    workEnd: hhmm,
    lateGraceMinutes: z.number().int().min(0).max(240),
    halfDayMinutes: z.number().int().min(30).max(720),
  })
  .superRefine((v, ctx) => {
    if (toMinutes(v.workEnd) <= toMinutes(v.workStart)) ctx.addIssue({ code: 'custom', path: ['workEnd'], message: 'errors.settings.endBeforeStart' });
  });

/** The payroll rules HR edits; confirmation is set only by the confirm endpoint. */
export const payrollBody = payrollConfigSchema.innerType().omit({ confirmedBy: true, confirmedAt: true }).superRefine((v, ctx) => {
  const r = payrollConfigSchema.safeParse({ ...v, confirmedBy: null, confirmedAt: null });
  if (!r.success) for (const i of r.error.issues.filter((x) => x.code === 'custom')) ctx.addIssue(i);
});

export const previewBody = z.object({ gross: z.number().int().min(0).max(1e12) });
