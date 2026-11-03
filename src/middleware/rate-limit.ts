import rateLimit from 'express-rate-limit';

export const loginRateLimit = () =>
  rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'errors.auth.tooManyAttempts' } });
    },
  });
