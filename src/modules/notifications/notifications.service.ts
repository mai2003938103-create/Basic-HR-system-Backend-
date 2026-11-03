import { and, desc, count, eq, isNull, type SQL } from 'drizzle-orm';
import { db, type DbOrTx } from '../../db/client.js';
import * as s from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { page } from '../../lib/list-query.js';

export async function notify(tx: DbOrTx, userIds: string | string[], type: string, titleKey: string, data: Record<string, unknown> = {}) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
  if (!ids.length) return;
  await tx.insert(s.notifications).values(ids.map((userId) => ({ userId, type, titleKey, data })));
}

export async function userIdOfEmployee(tx: DbOrTx, employeeId: string | null | undefined): Promise<string | undefined> {
  if (!employeeId) return undefined;
  const [u] = await tx.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.employeeId, employeeId), eq(s.users.isActive, true)));
  return u?.id;
}

export async function list(userId: string, q: { page: number; pageSize: number; unread?: boolean }) {
  const conds: (SQL | undefined)[] = [eq(s.notifications.userId, userId)];
  if (q.unread) conds.push(isNull(s.notifications.readAt));
  const where = and(...conds);
  const rows = await db.select().from(s.notifications).where(where).orderBy(desc(s.notifications.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const [{ total }] = await db.select({ total: count() }).from(s.notifications).where(where);
  const [{ unread }] = await db.select({ unread: count() }).from(s.notifications).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt)));
  return { ...page(rows, total, q), unread };
}

export async function markRead(userId: string, id: string) {
  const [row] = await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.id, id), eq(s.notifications.userId, userId))).returning();
  if (!row) throw notFound();
  return row;
}

export async function markAllRead(userId: string) {
  await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt)));
}
