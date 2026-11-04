import type { Prisma } from '../generated/prisma/client.js';
import type { AuthContext } from './auth-context.js';

const NOTHING: Prisma.EmployeeWhereInput = { id: { in: [] } };

/** Prisma filter over employees restricting rows to the caller's scope (undefined = no restriction). */
export function employeeScopeWhere(auth: AuthContext): Prisma.EmployeeWhereInput | undefined {
  if (auth.scope === 'all') return undefined;
  const self: Prisma.EmployeeWhereInput | undefined = auth.employeeId ? { id: auth.employeeId } : undefined;
  if (auth.scope === 'department') {
    const dept: Prisma.EmployeeWhereInput | undefined = auth.managedDepartmentIds.length ? { departmentId: { in: auth.managedDepartmentIds } } : undefined;
    if (dept && self) return { OR: [dept, self] };
    return dept ?? self ?? NOTHING;
  }
  return self ?? NOTHING;
}

export function canAccessEmployee(auth: AuthContext, emp: { id: string; departmentId: string | null }): boolean {
  if (auth.scope === 'all') return true;
  if (auth.employeeId && emp.id === auth.employeeId) return true;
  return auth.scope === 'department' && !!emp.departmentId && auth.managedDepartmentIds.includes(emp.departmentId);
}
