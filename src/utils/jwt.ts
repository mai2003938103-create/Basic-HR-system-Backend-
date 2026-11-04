import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ACCESS_TTL_SECONDS = 15 * 60;

export function signAccessToken(payload: { sub: string }): string {
  return jwt.sign({}, env.JWT_SECRET, { subject: payload.sub, expiresIn: ACCESS_TTL_SECONDS, algorithm: 'HS256' });
}

export function verifyAccessToken(token: string): { sub: string } {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub) throw new Error('invalid token');
  return { sub: decoded.sub };
}
