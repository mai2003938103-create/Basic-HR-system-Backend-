import { z } from 'zod';
import { boolQuery } from '../../lib/http.js';
import { listQuerySchema } from '../../lib/list-query.js';
import { passwordSchema } from '../../lib/password.js';

export const listUsersQuery = listQuerySchema(['email', 'createdAt', 'lastLoginAt'], 'email:asc').extend({
  isActive: boolQuery,
  role: z.string().optional(),
});
const email = z.string().trim().toLowerCase().email('errors.validation.email');
const roleCodes = z.array(z.string()).min(1, 'errors.validation.required');
export const createUserBody = z.object({ email, password: passwordSchema, roleCodes, employeeId: z.string().uuid().nullish() });
export const updateUserBody = z.object({ email: email.optional(), roleCodes: roleCodes.optional(), employeeId: z.string().uuid().nullish() });
export const userStatusBody = z.object({ isActive: z.boolean() });
