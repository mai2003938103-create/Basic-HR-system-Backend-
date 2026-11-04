import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { seedBase } from '../../scripts/seed.js';

const TABLES = [
  'notifications', 'audit_logs', 'refresh_tokens', 'leave_requests', 'leave_balances', 'attendance',
  'user_roles', 'role_permissions', 'users', 'departments', 'positions', 'employees', 'holidays',
  'leave_types', 'roles', 'permissions', 'company_settings',
  'pay_run_events', 'pay_items', 'pay_runs', 'employee_allowances', 'allowance_types',
];

export async function resetDb(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`));
  await seedBase(db);
}
