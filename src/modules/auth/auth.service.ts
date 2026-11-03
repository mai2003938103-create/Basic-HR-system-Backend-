import crypto from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';
import { loadAuthContext, type AuthContext } from '../../lib/auth-context.js';
import { badRequest, unauthenticated } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const randomToken = () => crypto.randomBytes(48).toString('base64url');

export interface MeDto {
  id: string;
  email: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
  scope: AuthContext['scope'];
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    departmentId: string;
  } | null;
}

export async function buildMe(ctx: AuthContext): Promise<MeDto> {
  const user = await db.query.users.findFirst({
    where: eq(s.users.id, ctx.userId),
    columns: { id: true, email: true, mustChangePassword: true },
    with: {
      employee: {
        columns: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, departmentId: true },
      },
    },
  });
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
  await db.insert(s.refreshTokens).values({
    userId,
    tokenHash: sha256(token),
    type: 'refresh',
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return token;
}

async function session(userId: string) {
  const ctx = await loadAuthContext(userId);
  if (!ctx) throw unauthenticated('errors.auth.accountDisabled');
  return { accessToken: signAccessToken({ sub: userId }), refreshToken: await issueRefreshToken(userId), user: await buildMe(ctx) };
}

export async function login(email: string, password: string) {
  const [user] = await db.select().from(s.users).where(eq(s.users.email, email));
  // Always run bcrypt so response time does not reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!user || !ok) throw unauthenticated('errors.auth.invalidCredentials');
  if (!(await loadAuthContext(user.id))) throw unauthenticated('errors.auth.accountDisabled');
  await db.update(s.users).set({ lastLoginAt: new Date() }).where(eq(s.users.id, user.id));
  return session(user.id);
}

export async function refresh(token: string | undefined) {
  if (!token) throw unauthenticated('errors.auth.sessionExpired');
  const [row] = await db
    .select()
    .from(s.refreshTokens)
    .where(and(eq(s.refreshTokens.tokenHash, sha256(token)), eq(s.refreshTokens.type, 'refresh')));
  if (!row) throw unauthenticated('errors.auth.sessionExpired');
  if (row.revokedAt) {
    // Reuse of a rotated token: assume theft and end every session of this user.
    await revokeAll(row.userId);
    throw unauthenticated('errors.auth.sessionExpired');
  }
  if (row.expiresAt <= new Date()) throw unauthenticated('errors.auth.sessionExpired');
  const updated = await db
    .update(s.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(s.refreshTokens.id, row.id), isNull(s.refreshTokens.revokedAt)))
    .returning({ id: s.refreshTokens.id });
  if (updated.length === 0) {
    await revokeAll(row.userId);
    throw unauthenticated('errors.auth.sessionExpired');
  }
  return session(row.userId);
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await db
    .update(s.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(s.refreshTokens.tokenHash, sha256(token)), isNull(s.refreshTokens.revokedAt)));
}

export async function revokeAll(userId: string) {
  await db
    .update(s.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(s.refreshTokens.userId, userId), isNull(s.refreshTokens.revokedAt)));
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest('errors.auth.wrongPassword', [{ field: 'currentPassword', message: 'errors.auth.wrongPassword' }]);
  }
  await db
    .update(s.users)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(eq(s.users.id, userId));
  await revokeAll(userId);
}

export async function createResetToken(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(s.refreshTokens).values({ userId, tokenHash: sha256(token), type: 'password_reset', expiresAt });
  return { token, expiresAt };
}

export async function resetPassword(token: string, newPassword: string) {
  const now = new Date();
  const [row] = await db
    .update(s.refreshTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(s.refreshTokens.tokenHash, sha256(token)),
        eq(s.refreshTokens.type, 'password_reset'),
        isNull(s.refreshTokens.revokedAt),
        gt(s.refreshTokens.expiresAt, now),
      ),
    )
    .returning();
  if (!row) throw badRequest('errors.auth.invalidToken');
  await db
    .update(s.users)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(eq(s.users.id, row.userId));
  await revokeAll(row.userId);
}
