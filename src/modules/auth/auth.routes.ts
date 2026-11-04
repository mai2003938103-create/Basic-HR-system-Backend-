import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { loginRateLimit } from '../../middlewares/rate-limit.js';
import { validate } from '../../middlewares/validate.js';
import * as c from './auth.controller.js';
import { changePasswordSchema, loginSchema, resetPasswordSchema } from './auth.schema.js';

export function authRoutes() {
  const r = Router();
  r.post('/login', loginRateLimit(), validate({ body: loginSchema }), c.login);
  r.post('/refresh', c.refresh);
  r.post('/logout', c.logout);
  r.get('/me', authenticate, c.me);
  r.put('/password', authenticate, validate({ body: changePasswordSchema }), c.changePassword);
  r.post('/reset-password', loginRateLimit(), validate({ body: resetPasswordSchema }), c.resetPassword);
  return r;
}
