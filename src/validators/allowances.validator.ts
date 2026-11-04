import { z } from 'zod';
import { code, requiredText } from '../utils/http.js';

export const allowanceTypeBody = z.object({ code, nameLo: requiredText(), nameEn: requiredText(), taxable: z.boolean().optional(), isActive: z.boolean().optional() });
export const employeeAllowancesBody = z.object({
  items: z.array(z.object({ typeId: z.string().uuid('errors.common.notFound'), amount: z.number().int('errors.validation.money').min(0, 'errors.validation.money').max(1e12) })).max(50),
});
