import crypto from 'node:crypto';
import * as tokens from '../models/refresh-token.model.js';
import * as users from '../models/user.model.js';
import { prisma, type Db } from '../models/prisma.js';
import { loadAuthContext, type AuthContext } from '../utils/auth-context.js';
import { badRequest, unauthenticated } from '../utils/errors.js';
import { signAccessToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
/** A token rotated this recently may still be used once more (several tabs refreshing together). */
export const ROTATION_GRACE_MS = 30 * 1000;

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const randomToken = () => crypto.randomBytes(48).toString('base64url');

export interface MeDto {
  id: string;
  email: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
  scope: AuthContext['scope'];
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; photoUrl: string | null; departmentId: string } | null;
}

export async function buildMe(ctx: AuthContext): Promise<MeDto> {
  const user = await users.findMe(ctx.userId);
  if (!user) throw unauthenticated();
  return {
    id: user.id,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
    roles: ctx.roles,
    permissions: [...ctx.permissions].sort(),
    scope: ctx.scope,
    employee: user.employee ?? null,
  };
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomToken();
  await tokens.createToken({ userId, tokenHash: sha256(token), type: 'refresh', expiresAt: new Date(Date.now() + REFRESH_TTL_MS) });
  return token;
}

async function session(userId: string) {
  const ctx = await loadAuthContext(userId);
  if (!ctx) throw unauthenticated('errors.auth.accountDisabled');
  return { accessToken: signAccessToken({ sub: userId }), refreshToken: await issueRefreshToken(userId), user: await buildMe(ctx) };
}

export async function login(email: string, password: string) {
  const user = await users.findByEmail(email);
  // Always run bcrypt so response time does not reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!user || !ok) throw unauthenticated('errors.auth.invalidCredentials');
  if (!(await loadAuthContext(user.id))) throw unauthenticated('errors.auth.accountDisabled');
  await users.update(user.id, { lastLoginAt: new Date() });
  return session(user.id);
}

export async function refresh(token: string | undefined) {
  if (!token) throw unauthenticated('errors.auth.sessionExpired');
  const row = await tokens.findByHash(sha256(token), 'refresh');
  if (!row) throw unauthenticated('errors.auth.sessionExpired');
  if (row.expiresAt <= new Date()) throw unauthenticated('errors.auth.sessionExpired');
  const now = new Date();
  const won = row.revokedAt ? 0 : await tokens.rotate(row.id, now);
  if (won === 0) {
    const latest = await tokens.findById(row.id);
    const inGrace = latest?.replacedAt && now.getTime() - latest.replacedAt.getTime() < ROTATION_GRACE_MS;
    if (!inGrace) {
      // Reuse of a rotated (or logged-out) token: assume theft and end every session of this user.
      await revokeAll(row.userId);
      throw unauthenticated('errors.auth.sessionExpired');
    }
  }
  return session(row.userId);
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await tokens.revokeByHash(sha256(token));
}

export async function revokeAll(userId: string, db: Db = prisma) {
  await tokens.revokeAllForUser(userId, db);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await users.findById(userId);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest('errors.auth.wrongPassword', [{ field: 'currentPassword', message: 'errors.auth.wrongPassword' }]);
  }
  await users.update(userId, { passwordHash: await hashPassword(newPassword), mustChangePassword: false });
  await revokeAll(userId);
}

export async function createResetToken(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await tokens.createToken({ userId, tokenHash: sha256(token), type: 'password_reset', expiresAt });
  return { token, expiresAt };
}

export async function resetPassword(token: string, newPassword: string) {
  const userId = await tokens.consumeResetToken(sha256(token), new Date());
  if (!userId) throw badRequest('errors.auth.invalidToken');
  await users.update(userId, { passwordHash: await hashPassword(newPassword), mustChangePassword: false });
  await revokeAll(userId);
}
