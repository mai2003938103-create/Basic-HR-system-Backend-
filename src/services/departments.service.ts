import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import * as departments from '../models/department.model.js';
import { prisma, withTx } from '../models/prisma.js';
import type { AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { likeEscape } from '../utils/http.js';
import { page, toPaging } from '../utils/list-query.js';
import { lockRows } from '../utils/lock.js';
import type { createDepartmentBody, listDepartmentsQuery, updateDepartmentBody } from '../validators/departments.validator.js';
import { departmentView } from '../views/department.view.js';

export async function list(q: z.infer<typeof listDepartmentsQuery>) {
  const where: Prisma.DepartmentWhereInput = {};
  if (q.search) {
    // Case-insensitive through the column collation; % and _ are literal.
    const p = likeEscape(q.search);
    where.OR = [{ code: { contains: p } }, { nameLo: { contains: p } }, { nameEn: { contains: p } }];
  }
  if (q.isActive !== undefined) where.isActive = q.isActive;
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const { rows, total } = await departments.list(where, [{ [sortField]: sortDir }, { id: 'asc' }], offset, limit);
  return page(rows.map(departmentView), total, q);
}

export async function get(id: string) {
  const row = await departments.findWithManager(id);
  if (!row) throw notFound();
  return departmentView(row);
}

async function assertManager(managerId: string | null | undefined) {
  if (!managerId) return;
  const m = await prisma.employee.findUnique({ where: { id: managerId }, select: { employmentStatus: true } });
  if (!m || m.employmentStatus === 'inactive' || m.employmentStatus === 'terminated') {
    throw badRequest('errors.department.invalidManager', [{ field: 'managerId', message: 'errors.department.invalidManager' }]);
  }
}

export async function create(auth: AuthContext, body: z.infer<typeof createDepartmentBody>) {
  await assertManager(body.managerId);
  const id = await withTx(async (tx) => {
    const d = await departments.create(body, tx);
    await audit(tx, auth, { action: 'department.create', entity: 'department', entityId: d.id, after: d });
    return d.id;
  });
  return get(id);
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof updateDepartmentBody>) {
  await assertManager(body.managerId);
  await withTx(async (tx) => {
    const before = await departments.findById(id, tx);
    if (!before) throw notFound();
    const after = await departments.update(id, body, tx);
    await audit(tx, auth, { action: 'department.update', entity: 'department', entityId: id, before, after });
  });
  return get(id);
}

export async function remove(auth: AuthContext, id: string) {
  await withTx(async (tx) => {
    if (!(await lockRows(tx, 'departments', [id])).length) throw notFound();
    const before = await departments.findById(id, tx);
    const used = await departments.usage(id, tx);
    if (used.employees > 0 || used.positions > 0) throw conflict('errors.department.inUse');
    await departments.remove(id, tx);
    await audit(tx, auth, { action: 'department.delete', entity: 'department', entityId: id, before });
  });
}
