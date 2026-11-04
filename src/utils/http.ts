import type { Request } from 'express';
import { z } from 'zod';

export const idParams = z.object({ id: z.string().uuid('errors.common.notFound') });
export const optionalText = z
  .string()
  .trim()
  .max(1000)
  .nullish()
  .transform((v) => (v ? v : null));
export const requiredText = (max = 200) => z.string().trim().min(1, 'errors.validation.required').max(max);
export const code = z
  .string()
  .trim()
  .min(1, 'errors.validation.required')
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, 'errors.validation.code')
  .transform((v) => v.toUpperCase());
export const boolQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));
export const ipOf = (req: Request) => req.ip;
/** Escapes LIKE wildcards in user input. */
export const likeEscape = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);
