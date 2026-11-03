import type { RequestHandler } from 'express';
import { loadAuthContext } from '../lib/auth-context.js';
import { unauthenticated } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return next(unauthenticated());
  let sub: string;
  try {
    sub = verifyAccessToken(token).sub;
  } catch {
    return next(unauthenticated('errors.auth.sessionExpired'));
  }
  const ctx = await loadAuthContext(sub);
  if (!ctx) return next(unauthenticated('errors.auth.accountDisabled'));
  req.auth = ctx;
  next();
};
