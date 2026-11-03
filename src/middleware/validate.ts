import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors.js';

export function zodDetails(err: ZodError) {
  return err.issues.map((i) => ({
    field: i.path.join('.'),
    message: i.message.startsWith('errors.') ? i.message : `errors.validation.${i.code}`,
  }));
}

export function validate(schemas: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) Object.defineProperty(req, 'query', { value: schemas.query.parse(req.query), writable: true });
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      next();
    } catch (e) {
      if (e instanceof ZodError) return next(badRequest('errors.validation.failed', zodDetails(e)));
      next(e);
    }
  };
}
