import type { EmployeeExtras, EmployeeRow } from '../models/employee.model.js';
import type { AuthContext } from '../utils/auth-context.js';

/** Pay and bank details: HR with company-wide scope, or the employee themself (spec §6). */
export const canSeeSalary = (auth: AuthContext, employeeId: string) =>
  (auth.scope === 'all' && auth.permissions.has('employee.update')) || auth.employeeId === employeeId;

export function employeeView(auth: AuthContext, r: EmployeeRow, x: EmployeeExtras) {
  const { searchText: _s, basicSalary, bankName, bankAccount, endDate, ...rest } = r;
  return {
    ...rest,
    ...(canSeeSalary(auth, r.id) ? { basicSalary, bankName, bankAccount, endDate } : {}),
    department: x.depts.get(r.departmentId) ?? null,
    position: x.positions.get(r.positionId) ?? null,
    user: x.users.get(r.id) ?? null,
  };
}
export type EmployeeDto = ReturnType<typeof employeeView>;
