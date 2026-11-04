import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { loginRateLimit } from '../middlewares/rate-limit.js';
import { validate } from '../middlewares/validate.js';
import type { Op } from '../utils/openapi.js';
import { changePasswordSchema, loginSchema, resetPasswordSchema } from '../validators/auth.validator.js';

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

export const authDocs: Op[] = [
  { method: 'post', path: '/api/auth/login', tag: 'Auth', summary: 'Sign in; sets the hrms_rt refresh cookie', body: loginSchema, public: true },
  { method: 'post', path: '/api/auth/refresh', tag: 'Auth', summary: 'Rotate the refresh cookie and get a new access token', public: true },
  { method: 'post', path: '/api/auth/logout', tag: 'Auth', summary: 'Revoke the refresh cookie', status: 204, public: true },
  { method: 'get', path: '/api/auth/me', tag: 'Auth', summary: 'Current user, roles and permissions' },
  { method: 'put', path: '/api/auth/password', tag: 'Auth', summary: 'Change own password', body: changePasswordSchema, status: 204 },
  { method: 'post', path: '/api/auth/reset-password', tag: 'Auth', summary: 'Set a new password with a reset token', body: resetPasswordSchema, status: 204, public: true },
];
