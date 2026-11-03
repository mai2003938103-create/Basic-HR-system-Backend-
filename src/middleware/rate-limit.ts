import type { Request, RequestHandler, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const tooMany = (_req: Request, res: Response) => {
  res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'errors.auth.tooManyAttempts' } });
};

/**
 * Sign-in throttling: 5 attempts per minute for one account from one IP (brute force),
 * plus a looser 60/minute ceiling per IP so an office behind one public IP is not locked out together.
 */
export function loginRateLimit(): RequestHandler[] {
  const perAccount = rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? req.body?.token ?? '').trim().toLowerCase()}`,
    handler: tooMany,
  });
  const perIp = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, handler: tooMany });
  return [perIp, perAccount];
}
