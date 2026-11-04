import { z } from 'zod';
import { code, requiredText } from '../utils/http.js';

export const holidayBody = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'errors.validation.date'), nameLo: requiredText(), nameEn: requiredText() });
export const holidayQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

export const leaveTypeBody = z.object({
  code,
  nameLo: requiredText(),
  nameEn: requiredText(),
  defaultDaysPerYear: z.coerce.number().min(0).max(366).transform(String),
  isPaid: z.boolean().optional(),
  documentRequiredAfterDays: z.number().int().min(0).max(366).nullish(),
  isActive: z.boolean().optional(),
});
