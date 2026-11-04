import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Db } from './prisma.js';

export const createMany = (rows: { userId: string; type: string; titleKey: string; data: Prisma.InputJsonValue }[], db: Db = prisma) => db.notification.createMany({ data: rows });

export async function list(userId: string, unreadOnly: boolean, skip: number, take: number, db: Db = prisma) {
  const where: Prisma.NotificationWhereInput = { userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { rows, total, unread };
}

/** Marks one of the user's notifications read; null when it is not theirs. */
export async function markRead(userId: string, id: string, db: Db = prisma) {
  const n = await db.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
  return n.count ? db.notification.findUnique({ where: { id } }) : null;
}

export const markAllRead = (userId: string, db: Db = prisma) => db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
