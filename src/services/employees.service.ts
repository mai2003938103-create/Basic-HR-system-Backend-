import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import * as employees from '../models/employee.model.js';
import { prisma, type Db, withTx } from '../models/prisma.js';
import * as roles from '../models/role.model.js';
import * as users from '../models/user.model.js';
import type { AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { localDate } from '../utils/dates.js';
import { badRequest, fieldError, forbidden, notFound } from '../utils/errors.js';
import { likeEscape } from '../utils/http.js';
import { page, toPaging } from '../utils/list-query.js';
import { lockRows } from '../utils/lock.js';
import { hashPassword } from '../utils/password.js';
import { canAccessEmployee, employeeScopeWhere } from '../utils/scope.js';
import { assertOtherSuperAdmin, isSuperAdmin } from '../utils/super-admin.js';
import type { createEmployeeBody, listEmployeesQuery, selfUpdateBody, statusBody, updateEmployeeBody } from '../validators/employees.validator.js';
import { employeeView } from '../views/employee.view.js';
import { revokeAll } from './auth.service.js';

/** NFC + lowercase; also folds Lao ໍ+າ (U+0ECD U+0EB2) into ຳ (U+0EB3), which NFC leaves apart. */
export const normalizeSearch = (v: string) => v.normalize('NFC').replace(/ໍາ/g, 'ຳ').toLowerCase().trim();
const searchTextOf = (e: { employeeCode: string; firstName: string; lastName: string; email: string; phone: string }) =>
  normalizeSearch([e.employeeCode, e.firstName, e.lastName, e.email, e.phone].join(' '));

const INACTIVE = new Set(['inactive', 'terminated']);
const requireAllScope = (auth: AuthContext) => {
  if (auth.scope !== 'all') throw forbidden();
};

export async function list(auth: AuthContext, q: z.infer<typeof listEmployeesQuery>) {
  const conds: Prisma.EmployeeWhereInput[] = [];
  const scope = employeeScopeWhere(auth);
  if (scope) conds.push(scope);
  // search_text is normalized and binary-collated; % and _ are literal.
  if (q.search) conds.push({ searchText: { contains: likeEscape(normalizeSearch(q.search)) } });
  if (q.departmentId) conds.push({ departmentId: q.departmentId });
  if (q.positionId) conds.push({ positionId: q.positionId });
  if (q.status) conds.push({ employmentStatus: q.status });
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const { rows, total } = await employees.list({ AND: conds }, [{ [sortField]: sortDir }, { id: 'asc' }], offset, limit);
  const x = await employees.extras(rows);
  return page(rows.map((r) => employeeView(auth, r, x)), total, q);
}

export async function get(auth: AuthContext, id: string) {
  const row = await employees.findById(id);
  if (!row || !canAccessEmployee(auth, row)) throw notFound();
  return employeeView(auth, row, await employees.extras([row]));
}

async function assertPosition(tx: Db, departmentId: string, positionId: string) {
  const p = await tx.position.findUnique({ where: { id: positionId }, select: { departmentId: true } });
  if (!p || p.departmentId !== departmentId) {
    throw badRequest('errors.employee.positionMismatch', [{ field: 'positionId', message: 'errors.employee.positionMismatch' }]);
  }
}

export async function create(auth: AuthContext, body: z.infer<typeof createEmployeeBody>) {
  requireAllScope(auth);
  const { account, ...data } = body;
  const id = await withTx(async (tx) => {
    await assertPosition(tx, data.departmentId, data.positionId);
    const e = await employees.create({ ...data, searchText: searchTextOf(data) }, tx);
    if (account) {
      const found = await roles.findByCodes(account.roleCodes, tx);
      if (found.length !== account.roleCodes.length) throw badRequest('errors.user.invalidRole', [{ field: 'account.roleCodes', message: 'errors.user.invalidRole' }]);
      if (found.some((r) => r.code === 'super_admin') && !auth.permissions.has('role.manage')) throw forbidden();
      await users.create({ email: account.email, passwordHash: await hashPassword(account.password), employeeId: e.id, mustChangePassword: true, roleIds: found.map((r) => r.id) }, tx);
    }
    await audit(tx, auth, { action: 'employee.create', entity: 'employee', entityId: e.id, after: e });
    return e.id;
  });
  return get(auth, id);
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof updateEmployeeBody>) {
  requireAllScope(auth);
  await withTx(async (tx) => {
    if (!(await lockRows(tx, 'employees', [id])).length) throw notFound();
    const before = (await employees.findById(id, tx))!;
    const merged = { ...before, ...body };
    if (body.departmentId || body.positionId) await assertPosition(tx, merged.departmentId, merged.positionId);
    const after = await employees.update(id, { ...body, searchText: searchTextOf(merged) }, tx);
    await audit(tx, auth, { action: 'employee.update', entity: 'employee', entityId: id, before, after });
  });
  return get(auth, id);
}

/** Own personal and contact details (self-service profile); no scope or permission beyond being this employee. */
export async function updateOwn(auth: AuthContext, body: z.infer<typeof selfUpdateBody>) {
  const id = auth.employeeId;
  if (!id) throw notFound();
  await withTx(async (tx) => {
    if (!(await lockRows(tx, 'employees', [id])).length) throw notFound();
    const before = (await employees.findById(id, tx))!;
    // Same rule as HR's form: at least 15 years old on the hire date.
    const fifteenth = `${Number(body.dateOfBirth.slice(0, 4)) + 15}${body.dateOfBirth.slice(4)}`;
    if (fifteenth > before.hireDate) throw fieldError('dateOfBirth', 'errors.employee.tooYoung');
    const after = await employees.update(id, { ...body, searchText: searchTextOf({ ...before, ...body }) }, tx);
    await audit(tx, auth, { action: 'employee.selfUpdate', entity: 'employee', entityId: id, before, after });
  });
  return get(auth, id);
}

export async function setStatus(auth: AuthContext, id: string, status: z.infer<typeof statusBody>['status']) {
  requireAllScope(auth);
  let userId: string | undefined;
  await withTx(async (tx) => {
    if (!(await lockRows(tx, 'employees', [id])).length) throw notFound();
    const before = (await employees.findById(id, tx))!;
    const linked = await users.findByEmployee(id, tx);
    if (linked && (await isSuperAdmin(tx, linked.id))) {
      if (!auth.permissions.has('role.manage')) throw forbidden();
      if (INACTIVE.has(status)) await assertOtherSuperAdmin(tx, linked.id);
    }
    // Termination records the last day for payroll; coming back to work clears it.
    const endDate = status === 'terminated' ? (before.endDate ?? localDate(new Date())) : status === 'inactive' ? before.endDate : null;
    await employees.update(id, { employmentStatus: status, endDate }, tx);
    // Leaving employment disables the login; coming back re-enables it. Other moves (probation → active)
    // leave a login that an admin disabled on purpose untouched.
    const wasInactive = INACTIVE.has(before.employmentStatus);
    if (linked && (INACTIVE.has(status) || wasInactive)) await users.update(linked.id, { isActive: !INACTIVE.has(status) }, tx);
    userId = linked?.id;
    await audit(tx, auth, { action: 'employee.status', entity: 'employee', entityId: id, before: { employmentStatus: before.employmentStatus }, after: { employmentStatus: status } });
  });
  if (userId && INACTIVE.has(status)) await revokeAll(userId);
  return get(auth, id);
}

export async function setPhoto(auth: AuthContext, id: string, key: string) {
  requireAllScope(auth);
  if (!(await employees.findById(id))) throw notFound();
  await employees.update(id, { photoUrl: `/api/files/${key}` });
  return get(auth, id);
}

/** Own profile photo: any signed-in employee may change theirs; nothing else on the record. */
export async function setOwnPhoto(auth: AuthContext, id: string, key: string | null) {
  await employees.update(id, { photoUrl: key ? `/api/files/${key}` : null });
  return get(auth, id);
}
