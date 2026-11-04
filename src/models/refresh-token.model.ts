import type { TokenType } from '../generated/prisma/client.js';
import { prisma, type Db } from './prisma.js';

export const createToken = (data: { userId: string; tokenHash: string; type: TokenType; expiresAt: Date }, db: Db = prisma) => db.refreshToken.create({ data });

export const findByHash = (tokenHash: string, type: TokenType, db: Db = prisma) => db.refreshToken.findFirst({ where: { tokenHash, type } });

export const findById = (id: string, db: Db = prisma) => db.refreshToken.findUnique({ where: { id } });

/** Atomically marks an unrevoked token as rotated; 1 when this call won, 0 when someone else did. */
export const rotate = async (id: string, now: Date, db: Db = prisma) =>
  (await db.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now, replacedAt: now } })).count;

export const revokeByHash = (tokenHash: string, db: Db = prisma) =>
  db.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });

export const revokeAllForUser = (userId: string, db: Db = prisma) =>
  db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

/** Consumes a live password-reset token once; returns its user id or null. */
export async function consumeResetToken(tokenHash: string, now: Date, db: Db = prisma): Promise<string | null> {
  const row = await db.refreshToken.findFirst({ where: { tokenHash, type: 'password_reset', revokedAt: null, expiresAt: { gt: now } } });
  if (!row) return null;
  const won = await db.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now } });
  return won.count ? row.userId : null;
}
