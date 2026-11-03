import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env.js';
import * as svc from './auth.service.js';

export const COOKIE = 'hrms_rt';
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: svc.REFRESH_TTL_MS,
});

function sendSession(res: Response, s: Awaited<ReturnType<typeof svc.login>>) {
  res.cookie(COOKIE, s.refreshToken, cookieOptions());
  res.json({ data: { accessToken: s.accessToken, user: s.user } });
}

export async function login(req: Request, res: Response) {
  sendSession(res, await svc.login(req.body.email, req.body.password));
}

export async function refresh(req: Request, res: Response) {
  try {
    sendSession(res, await svc.refresh(req.cookies?.[COOKIE]));
  } catch (e) {
    res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
    throw e;
  }
}

export async function logout(req: Request, res: Response) {
  await svc.logout(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ data: await svc.buildMe(req.auth!) });
}

export async function changePassword(req: Request, res: Response) {
  await svc.changePassword(req.auth!.userId, req.body.currentPassword, req.body.newPassword);
  res.status(204).end();
}

export async function resetPassword(req: Request, res: Response) {
  await svc.resetPassword(req.body.token, req.body.newPassword);
  res.status(204).end();
}
