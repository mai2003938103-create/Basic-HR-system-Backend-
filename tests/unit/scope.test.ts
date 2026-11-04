import type { AuthContext } from '../../src/utils/auth-context.js';
import { canAccessEmployee, employeeScopeWhere } from '../../src/utils/scope.js';

const ctx = (over: Partial<AuthContext>): AuthContext => ({
  userId: 'u', employeeId: 'e-self', email: 'x@y', roles: [], permissions: new Set(), scope: 'self', managedDepartmentIds: [], ...over,
});

describe('scope', () => {
  it('all scope adds no filter', () => {
    expect(employeeScopeWhere(ctx({ scope: 'all' }))).toBeUndefined();
  });

  it('self scope filters by own employee id', () => {
    expect(employeeScopeWhere(ctx({ scope: 'self' }))).toEqual({ id: 'e-self' });
  });

  it('department scope covers managed departments and self', () => {
    expect(employeeScopeWhere(ctx({ scope: 'department', managedDepartmentIds: ['d1', 'd2'] }))).toEqual({
      OR: [{ departmentId: { in: ['d1', 'd2'] } }, { id: 'e-self' }],
    });
  });

  it('a user without an employee record and self scope sees nothing', () => {
    expect(employeeScopeWhere(ctx({ scope: 'self', employeeId: null }))).toEqual({ id: { in: [] } });
  });

  it('canAccessEmployee follows the scope', () => {
    const m = ctx({ scope: 'department', managedDepartmentIds: ['d1'] });
    expect(canAccessEmployee(m, { id: 'x', departmentId: 'd1' })).toBe(true);
    expect(canAccessEmployee(m, { id: 'e-self', departmentId: 'd9' })).toBe(true);
    expect(canAccessEmployee(m, { id: 'x', departmentId: 'd2' })).toBe(false);
    expect(canAccessEmployee(ctx({ scope: 'all' }), { id: 'x', departmentId: 'd2' })).toBe(true);
    expect(canAccessEmployee(ctx({ scope: 'self' }), { id: 'x', departmentId: 'd2' })).toBe(false);
  });
});
