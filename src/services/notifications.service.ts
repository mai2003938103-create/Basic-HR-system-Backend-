import type { Prisma } from '../generated/prisma/client.js';
import * as notifications from '../models/notification.model.js';
import { prisma, type Db } from '../models/prisma.js';
import { notFound } from '../utils/errors.js';
import { page } from '../utils/list-query.js';

export async function notify(tx: Db, userIds: string | string[], type: string, titleKey: string, data: Record<string, unknown> = {}) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
  if (!ids.length) return;
  await notifications.createMany(ids.map((userId) => ({ userId, type, titleKey, data: data as Prisma.InputJsonValue })), tx);
}

export async function userIdOfEmployee(tx: Db, employeeId: string | null | undefined): Promise<string | undefined> {
  if (!employeeId) return undefined;
  const u = await tx.user.findFirst({ where: { employeeId, isActive: true }, select: { id: true } });
  return u?.id;
}

export async function list(userId: string, q: { page: number; pageSize: number; unread?: boolean }) {
  const { rows, total, unread } = await notifications.list(userId, !!q.unread, (q.page - 1) * q.pageSize, q.pageSize);
  return { ...page(rows, total, q), unread };
}

export async function markRead(userId: string, id: string) {
  const row = await notifications.markRead(userId, id);
  if (!row) throw notFound();
  return row;
}

export async function markAllRead(userId: string) {
  await notifications.markAllRead(userId);
}
