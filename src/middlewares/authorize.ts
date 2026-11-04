import type { RequestHandler } from 'express';
import { forbidden, unauthenticated } from '../utils/errors.js';

/** Requires every listed permission. Must run after `authenticate`. */
export function authorize(...permissions: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthenticated());
    if (!permissions.every((p) => req.auth!.permissions.has(p))) return next(forbidden());
    next();
  };
}
