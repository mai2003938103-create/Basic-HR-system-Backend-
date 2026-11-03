import type { DbOrTx } from '../db/client.js';
import * as s from '../db/schema.js';
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

export async function audit(
  tx: DbOrTx,
  auth: Pick<AuthContext, 'userId'> | null,
  entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; ip?: string },
): Promise<void> {
  await tx.insert(s.auditLogs).values({
    actorUserId: auth?.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before === undefined ? null : scrub(JSON.parse(JSON.stringify(entry.before))),
    after: entry.after === undefined ? null : scrub(JSON.parse(JSON.stringify(entry.after))),
    ip: entry.ip ?? null,
  });
}
