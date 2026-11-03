import { z } from 'zod';
import { passwordSchema } from '../../lib/password.js';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('errors.validation.email'),
  password: z.string().min(1, 'errors.validation.required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'errors.validation.required'),
  newPassword: passwordSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: passwordSchema,
});
