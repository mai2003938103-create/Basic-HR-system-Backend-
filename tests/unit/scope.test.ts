import { PgDialect } from 'drizzle-orm/pg-core';
import type { AuthContext } from '../../src/lib/auth-context.js';
import { canAccessEmployee, employeeScopeWhere } from '../../src/lib/scope.js';

const ctx = (over: Partial<AuthContext>): AuthContext => ({
  userId: 'u', employeeId: 'e-self', email: 'x@y', roles: [], permissions: new Set(), scope: 'self', managedDepartmentIds: [], ...over,
});
const render = (w: ReturnType<typeof employeeScopeWhere>) => (w ? new PgDialect({ casing: 'snake_case' }).sqlToQuery(w) : undefined);

describe('scope', () => {
  it('all scope adds no filter', () => {
    expect(employeeScopeWhere(ctx({ scope: 'all' }))).toBeUndefined();
  });

  it('self scope filters by own employee id', () => {
    const q = render(employeeScopeWhere(ctx({ scope: 'self' })))!;
    expect(q.sql).toContain('"employees"."id" = $1');
    expect(q.params).toEqual(['e-self']);
  });

  it('department scope covers managed departments and self', () => {
    const q = render(employeeScopeWhere(ctx({ scope: 'department', managedDepartmentIds: ['d1', 'd2'] })))!;
    expect(q.sql).toContain('"employees"."department_id" in');
    expect(q.params).toEqual(['d1', 'd2', 'e-self']);
  });

  it('a user without an employee record and self scope sees nothing', () => {
    const q = render(employeeScopeWhere(ctx({ scope: 'self', employeeId: null })))!;
    expect(q.sql).toMatch(/false/);
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
