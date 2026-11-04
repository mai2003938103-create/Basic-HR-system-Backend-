import { prisma } from '../models/prisma.js';

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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      employee: { select: { id: true, employmentStatus: true } },
      roles: { include: { role: { include: { permissions: { include: { permission: { select: { code: true } } } } } } } },
    },
  });
  if (!user || !user.isActive) return null;
  if (user.employee && INACTIVE.has(user.employee.employmentStatus)) return null;

  const roles = user.roles.map((r) => r.role);
  const permissions = new Set(roles.flatMap((r) => r.permissions.map((p) => p.permission.code)));
  const scope = roles.reduce<Scope>((acc, r) => (RANK[r.scope] > RANK[acc] ? r.scope : acc), 'self');
  const managed = user.employeeId
    ? await prisma.department.findMany({ where: { managerId: user.employeeId, isActive: true }, select: { id: true } })
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
  const rows = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: { permissions: { some: { permission: { code } } } } } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
