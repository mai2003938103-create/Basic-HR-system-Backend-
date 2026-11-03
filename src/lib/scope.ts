import { eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import * as s from '../db/schema.js';
import type { AuthContext } from './auth-context.js';

const NOTHING = sql`false`;

/** WHERE fragment over `employees` restricting rows to the caller's scope (undefined = no restriction). */
export function employeeScopeWhere(auth: AuthContext): SQL | undefined {
  if (auth.scope === 'all') return undefined;
  const self = auth.employeeId ? eq(s.employees.id, auth.employeeId) : undefined;
  if (auth.scope === 'department') {
    const dept = auth.managedDepartmentIds.length ? inArray(s.employees.departmentId, auth.managedDepartmentIds) : undefined;
    return or(dept, self) ?? NOTHING;
  }
  return self ?? NOTHING;
}

export function canAccessEmployee(auth: AuthContext, emp: { id: string; departmentId: string | null }): boolean {
  if (auth.scope === 'all') return true;
  if (auth.employeeId && emp.id === auth.employeeId) return true;
  return auth.scope === 'department' && !!emp.departmentId && auth.managedDepartmentIds.includes(emp.departmentId);
}
