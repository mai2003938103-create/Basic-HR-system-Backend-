import { z } from 'zod';

const money = z.number({ invalid_type_error: 'errors.validation.money' }).int('errors.validation.money').min(0, 'errors.validation.money').max(1_000_000_000_000);

export const createRunBody = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'errors.validation.period') });
export const listRunsQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });
export const runItemParams = z.object({ id: z.string().uuid('errors.common.notFound'), employeeId: z.string().uuid('errors.common.notFound') });
export const itemBody = z.object({
  allowance: money,
  bonus: money,
  overtimeMinutes: z.number().int('errors.validation.money').min(0, 'errors.validation.money').max(100000),
  unpaidDays: z.number().min(0, 'errors.validation.money').max(31).refine((v) => Math.round(v * 10) === v * 10, 'errors.validation.money'),
  otherDeduction: money,
  note: z.string().trim().max(500).nullish().transform((v) => v || null),
});
export const returnBody = z.object({ note: z.string().trim().min(1, 'errors.validation.required').max(500) });
export const exportRunQuery = z.object({ format: z.enum(['csv']).default('csv'), lang: z.enum(['lo', 'en']).default('lo') });

export const payslipListQuery = z.object({ employeeId: z.string().uuid().optional() });
export const payslipParams = z.object({ runId: z.string().uuid('errors.common.notFound'), employeeId: z.string().uuid('errors.common.notFound') });

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'errors.validation.period');
const year = z.coerce.number().int().min(2000).max(2100);
export const attendanceReportQuery = z.object({ month: month.optional(), departmentId: z.string().uuid().optional() });
export const leaveReportQuery = z.object({ year: year.optional(), departmentId: z.string().uuid().optional() });
export const payrollReportQuery = z.object({ year: year.optional() });
