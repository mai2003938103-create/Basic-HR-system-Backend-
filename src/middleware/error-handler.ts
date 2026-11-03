import 'express-async-errors';
import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError, badRequest } from '../lib/errors.js';

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = typeof e?.code === 'string' ? e.code : typeof e?.cause?.code === 'string' ? e.cause.code : undefined;
  return code && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof MulterError) {
    err = err.code === 'LIMIT_FILE_SIZE' ? badRequest('errors.upload.tooLarge') : badRequest('errors.upload.invalidType');
  }
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.messageKey, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }
  const code = pgCode(err);
  if (code === '23505') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'errors.common.duplicate' } });
    return;
  }
  if (code === '23503') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'errors.common.inUse' } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'errors.validation.invalidJson' } });
    return;
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'errors.common.internal' } });
};
