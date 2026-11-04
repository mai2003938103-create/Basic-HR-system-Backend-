import { Prisma } from '../generated/prisma/client.js';

/** Tables whose rows Stage 1/2 lock before a read-modify-write. */
export type LockTable = 'users' | 'roles' | 'employees' | 'departments' | 'positions' | 'leave_requests' | 'leave_balances' | 'pay_runs' | 'refresh_tokens';
const TABLES = new Set<LockTable>(['users', 'roles', 'employees', 'departments', 'positions', 'leave_requests', 'leave_balances', 'pay_runs', 'refresh_tokens']);

/** SELECT … FOR UPDATE inside a transaction; returns the ids that exist (now locked until commit). */
export async function lockRows(tx: Prisma.TransactionClient, table: LockTable, ids: string[]): Promise<string[]> {
  if (!TABLES.has(table)) throw new Error(`lockRows: table ${table} is not lockable`);
  if (ids.length === 0) return [];
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ${Prisma.raw('`' + table + '`')} WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
  return rows.map((r) => r.id);
}
