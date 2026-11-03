import bcrypt from 'bcrypt';
import { z } from 'zod';

const COST = process.env.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (pw: string) => bcrypt.hash(pw, COST);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export const passwordSchema = z
  .string()
  .min(8, 'errors.password.weak')
  .max(128, 'errors.password.weak')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'errors.password.weak');
