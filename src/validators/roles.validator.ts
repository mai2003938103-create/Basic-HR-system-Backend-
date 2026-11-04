import { z } from 'zod';
import { requiredText } from '../utils/http.js';

export const roleBody = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/, 'errors.validation.code'),
  nameLo: requiredText(),
  nameEn: requiredText(),
  scope: z.enum(['all', 'department', 'self']),
  permissionCodes: z.array(z.string()),
});
export const roleUpdateBody = roleBody.omit({ code: true }).partial();
