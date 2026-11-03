import { and, asc, count, desc, eq, inArray, like, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { db, type DbOrTx } from '../../db/client.js';
import * as s from '../../db/schema.js';
import type { AuthContext } from '../../lib/auth-context.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { likeEscape } from '../../lib/http.js';
import { page, toPaging } from '../../lib/list-query.js';
import { hashPassword } from '../../lib/password.js';
import { canAccessEmployee, employeeScopeWhere } from '../../lib/scope.js';
import { revokeAll } from '../auth/auth.service.js';
import { assertOtherSuperAdmin, isSuperAdmin } from '../../lib/super-admin.js';
import type { createEmployeeBody, listEmployeesQuery, statusBody, updateEmployeeBody } from './employees.schema.js';

/** NFC + lowercase; also folds Lao ໍ+າ (U+0ECD U+0EB2) into ຳ (U+0EB3), which NFC leaves apart. */
export const normalizeSearch = (v: string) => v.normalize('NFC').replace(/\u0ECD\u0EB2/g, '\u0EB3').toLowerCase().trim();
const searchTextOf = (e: { employeeCode: string; firstName: string; lastName: string; email: string; phone: string }) =>
  normalizeSearch([e.employeeCode, e.firstName, e.lastName, e.email, e.phone].join(' '));

const INACTIVE = new Set(['inactive', 'terminated']);
const canSeeSalary = (auth: AuthContext, employeeId: string) =>
  (auth.scope === 'all' && auth.permissions.has('employee.update')) || auth.employeeId === employeeId;
const requireAllScope = (auth: AuthContext) => {
  if (auth.scope !== 'all') throw forbidden();
};

type EmployeeRow = typeof s.employees.$inferSelect;

async function loadExtras(rows: EmployeeRow[]) {
  if (rows.length === 0) return { depts: new Map(), positions: new Map(), users: new Map() };
  const deptIds = [...new Set(rows.map((r) => r.departmentId))];
  const posIds = [...new Set(rows.map((r) => r.positionId))];
  const empIds = rows.map((r) => r.id);
  const [depts, positions, users] = await Promise.all([
    db.select({ id: s.departments.id, code: s.departments.code, nameLo: s.departments.nameLo, nameEn: s.departments.nameEn }).from(s.departments).where(inArray(s.departments.id, deptIds)),
    db.select({ id: s.positions.id, code: s.positions.code, nameLo: s.positions.nameLo, nameEn: s.positions.nameEn }).from(s.positions).where(inArray(s.positions.id, posIds)),
    db.query.users.findMany({
      where: inArray(s.users.employeeId, empIds),
      columns: { id: true, email: true, isActive: true, employeeId: true },
      with: { roles: { with: { role: { columns: { code: true } } } } },
    }),
  ]);
  return {
    depts: new Map(depts.map((d) => [d.id, d])),
    positions: new Map(positions.map((p) => [p.id, p])),
    users: new Map(users.map((u) => [u.employeeId!, { id: u.id, email: u.email, isActive: u.isActive, roles: u.roles.map((r) => r.role.code).sort() }])),
  };
}

function toDto(auth: AuthContext, r: EmployeeRow, x: Awaited<ReturnType<typeof loadExtras>>) {
  const { searchText: _s, basicSalary, ...rest } = r;
  return {
    ...rest,
    ...(canSeeSalary(auth, r.id) ? { basicSalary } : {}),
    department: x.depts.get(r.departmentId) ?? null,
    position: x.positions.get(r.positionId) ?? null,
    user: x.users.get(r.id) ?? null,
  };
}
export type EmployeeDto = ReturnType<typeof toDto>;

export async function list(auth: AuthContext, q: z.infer<typeof listEmployeesQuery>) {
  const conds: (SQL | undefined)[] = [employeeScopeWhere(auth)];
  if (q.search) conds.push(like(s.employees.searchText, `%${likeEscape(normalizeSearch(q.search))}%`));
  if (q.departmentId) conds.push(eq(s.employees.departmentId, q.departmentId));
  if (q.positionId) conds.push(eq(s.employees.positionId, q.positionId));
  if (q.status) conds.push(eq(s.employees.employmentStatus, q.status));
  const where = and(...conds);
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const col = s.employees[sortField as 'employeeCode'];
  const rows = await db.select().from(s.employees).where(where).orderBy(sortDir === 'asc' ? asc(col) : desc(col), asc(s.employees.id)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(s.employees).where(where);
  const extras = await loadExtras(rows);
  return page(rows.map((r) => toDto(auth, r, extras)), total, q);
}

export async function get(auth: AuthContext, id: string) {
  const [row] = await db.select().from(s.employees).where(eq(s.employees.id, id));
  if (!row || !canAccessEmployee(auth, row)) throw notFound();
  return toDto(auth, row, await loadExtras([row]));
}

async function assertPosition(tx: DbOrTx, departmentId: string, positionId: string) {
  const [p] = await tx.select({ departmentId: s.positions.departmentId }).from(s.positions).where(eq(s.positions.id, positionId));
  if (!p || p.departmentId !== departmentId) {
    throw badRequest('errors.employee.positionMismatch', [{ field: 'positionId', message: 'errors.employee.positionMismatch' }]);
  }
}

export async function create(auth: AuthContext, body: z.infer<typeof createEmployeeBody>) {
  requireAllScope(auth);
  const { account, ...data } = body;
  const id = await db.transaction(async (tx) => {
    await assertPosition(tx, data.departmentId, data.positionId);
    const [e] = await tx.insert(s.employees).values({ ...data, searchText: searchTextOf(data) }).returning();
    if (account) {
      const roles = await tx.select().from(s.roles).where(inArray(s.roles.code, account.roleCodes));
      if (roles.length !== account.roleCodes.length) throw badRequest('errors.user.invalidRole', [{ field: 'account.roleCodes', message: 'errors.user.invalidRole' }]);
      if (roles.some((r) => r.code === 'super_admin') && !auth.permissions.has('role.manage')) throw forbidden();
      const [u] = await tx.insert(s.users).values({ email: account.email, passwordHash: await hashPassword(account.password), employeeId: e.id, mustChangePassword: true }).returning();
      await tx.insert(s.userRoles).values(roles.map((r) => ({ userId: u.id, roleId: r.id })));
    }
    await audit(tx, auth, { action: 'employee.create', entity: 'employee', entityId: e.id, after: e });
    return e.id;
  });
  return get(auth, id);
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof updateEmployeeBody>) {
  requireAllScope(auth);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.employees).where(eq(s.employees.id, id)).for('update');
    if (!before) throw notFound();
    const merged = { ...before, ...body };
    if (body.departmentId || body.positionId) await assertPosition(tx, merged.departmentId, merged.positionId);
    const [after] = await tx.update(s.employees).set({ ...body, searchText: searchTextOf(merged) }).where(eq(s.employees.id, id)).returning();
    await audit(tx, auth, { action: 'employee.update', entity: 'employee', entityId: id, before, after });
  });
  return get(auth, id);
}

export async function setStatus(auth: AuthContext, id: string, status: z.infer<typeof statusBody>['status']) {
  requireAllScope(auth);
  let userId: string | undefined;
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.employees).where(eq(s.employees.id, id)).for('update');
    if (!before) throw notFound();
    const [linked] = await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.employeeId, id));
    if (linked && (await isSuperAdmin(tx, linked.id))) {
      if (!auth.permissions.has('role.manage')) throw forbidden();
      if (INACTIVE.has(status)) await assertOtherSuperAdmin(tx, linked.id);
    }
    await tx.update(s.employees).set({ employmentStatus: status }).where(eq(s.employees.id, id));
    // Leaving employment disables the login; coming back re-enables it. Other moves (probation → active)
    // leave a login that an admin disabled on purpose untouched.
    const wasInactive = INACTIVE.has(before.employmentStatus);
    if (linked && (INACTIVE.has(status) || wasInactive)) {
      await tx.update(s.users).set({ isActive: !INACTIVE.has(status) }).where(eq(s.users.id, linked.id));
    }
    userId = linked?.id;
    await audit(tx, auth, { action: 'employee.status', entity: 'employee', entityId: id, before: { employmentStatus: before.employmentStatus }, after: { employmentStatus: status } });
  });
  if (userId && INACTIVE.has(status)) await revokeAll(userId);
  return get(auth, id);
}

export async function setPhoto(auth: AuthContext, id: string, key: string) {
  requireAllScope(auth);
  const [row] = await db.update(s.employees).set({ photoUrl: `/api/files/${key}` }).where(eq(s.employees.id, id)).returning({ id: s.employees.id });
  if (!row) throw notFound();
  return get(auth, id);
}
