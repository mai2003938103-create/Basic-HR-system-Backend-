import 'express-async-errors';
import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError, badRequest } from '../utils/errors.js';

type DbFailure = 'duplicate' | 'inUse' | 'notFound';

/** Maps Prisma / MySQL errors to the Stage 1 responses (unique → 409 duplicate, FK → 409 in use, missing row → 404). */
function dbFailure(err: unknown): DbFailure | undefined {
  const e = err as { code?: unknown; errno?: unknown; meta?: { driverAdapterError?: { cause?: { kind?: string } } }; cause?: { errno?: unknown } };
  const kind = e?.meta?.driverAdapterError?.cause?.kind;
  if (e?.code === 'P2002' || kind === 'UniqueConstraintViolation') return 'duplicate';
  if (e?.code === 'P2003' || kind === 'ForeignKeyConstraintViolation') return 'inUse';
  if (e?.code === 'P2025') return 'notFound';
  const errno = typeof e?.errno === 'number' ? e.errno : typeof e?.cause?.errno === 'number' ? e.cause.errno : undefined;
  if (errno === 1062) return 'duplicate';
  if (errno === 1451 || errno === 1452) return 'inUse';
  return undefined;
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
  const failure = dbFailure(err);
  if (failure === 'duplicate') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'errors.common.duplicate' } });
    return;
  }
  if (failure === 'inUse') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'errors.common.inUse' } });
    return;
  }
  if (failure === 'notFound') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'errors.common.notFound' } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'errors.validation.invalidJson' } });
    return;
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'errors.common.internal' } });
};
