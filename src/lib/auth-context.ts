import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as s from '../db/schema.js';

export type Scope = 'all' | 'department' | 'self';

export interface AuthContext {
  userId: string;
  employeeId: string | null;
  email: string;
  roles: string[];
  permissions: Set<string>;
  scope: Scope;
  managedDepartmentIds: string[];
}

const RANK: Record<Scope, number> = { self: 0, department: 1, all: 2 };
const INACTIVE = new Set(['inactive', 'terminated']);

/** Loads a fresh auth context; returns null when the account may not use the system. */
export async function loadAuthContext(userId: string): Promise<AuthContext | null> {
  const user = await db.query.users.findFirst({
    where: eq(s.users.id, userId),
    with: {
      employee: { columns: { id: true, employmentStatus: true } },
      roles: { with: { role: { with: { permissions: { with: { permission: { columns: { code: true } } } } } } } },
    },
  });
  if (!user || !user.isActive) return null;
  if (user.employee && INACTIVE.has(user.employee.employmentStatus)) return null;

  const roles = user.roles.map((r) => r.role);
  const permissions = new Set(roles.flatMap((r) => r.permissions.map((p) => p.permission.code)));
  const scope = roles.reduce<Scope>((acc, r) => (RANK[r.scope] > RANK[acc] ? r.scope : acc), 'self');
  const managed = user.employeeId
    ? await db
        .select({ id: s.departments.id })
        .from(s.departments)
        .where(and(eq(s.departments.managerId, user.employeeId), eq(s.departments.isActive, true)))
    : [];

  return {
    userId: user.id,
    employeeId: user.employeeId,
    email: user.email,
    roles: roles.map((r) => r.code),
    permissions,
    scope,
    managedDepartmentIds: managed.map((d) => d.id),
  };
}

export async function userIdsWithPermission(code: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: s.users.id })
    .from(s.users)
    .innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id))
    .innerJoin(s.rolePermissions, eq(s.rolePermissions.roleId, s.userRoles.roleId))
    .innerJoin(s.permissions, eq(s.permissions.id, s.rolePermissions.permissionId))
    .where(and(eq(s.permissions.code, code), eq(s.users.isActive, true)));
  return rows.map((r) => r.id);
}

