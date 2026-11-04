import { Prisma } from '../generated/prisma/client.js';
import type { Db } from '../models/prisma.js';
import type { AuthContext } from './auth-context.js';

const SECRET_KEYS = new Set(['passwordHash', 'password', 'tokenHash', 'token', 'refreshToken', 'accessToken']);

function scrub(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !SECRET_KEYS.has(k))
        .map(([k, val]) => [k, scrub(val)]),
    );
  }
  return v;
}

const snapshot = (v: unknown) => (v === undefined || v === null ? Prisma.DbNull : (scrub(JSON.parse(JSON.stringify(v))) as Prisma.InputJsonValue));

export async function audit(
  tx: Db,
  auth: Pick<AuthContext, 'userId'> | null,
  entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; ip?: string },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: auth?.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: snapshot(entry.before),
      after: snapshot(entry.after),
      ip: entry.ip ?? null,
    },
  });
}
