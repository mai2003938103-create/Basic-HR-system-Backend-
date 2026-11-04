import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import * as positions from '../models/position.model.js';
import { prisma } from '../models/prisma.js';
import type { AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { likeEscape } from '../utils/http.js';
import { page, toPaging } from '../utils/list-query.js';
import { lockRows } from '../utils/lock.js';
import type { createPositionBody, listPositionsQuery, updatePositionBody } from '../validators/positions.validator.js';
import { positionView } from '../views/position.view.js';

export async function list(q: z.infer<typeof listPositionsQuery>) {
  const where: Prisma.PositionWhereInput = {};
  if (q.search) {
    const p = likeEscape(q.search);
    where.OR = [{ code: { contains: p } }, { nameLo: { contains: p } }, { nameEn: { contains: p } }];
  }
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.departmentId) where.departmentId = q.departmentId;
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const { rows, total } = await positions.list(where, [{ [sortField]: sortDir }, { id: 'asc' }], offset, limit);
  return page(rows.map(positionView), total, q);
}

export async function get(id: string) {
  const row = await positions.findWithDepartment(id);
  if (!row) throw notFound();
  return positionView(row);
}

async function assertDepartment(id: string | undefined) {
  if (!id) return;
  if (!(await prisma.department.findUnique({ where: { id }, select: { id: true } }))) {
    throw badRequest('errors.position.invalidDepartment', [{ field: 'departmentId', message: 'errors.position.invalidDepartment' }]);
  }
}

export async function create(auth: AuthContext, body: z.infer<typeof createPositionBody>) {
  await assertDepartment(body.departmentId);
  const id = await prisma.$transaction(async (tx) => {
    const p = await positions.create(body, tx);
    await audit(tx, auth, { action: 'position.create', entity: 'position', entityId: p.id, after: p });
    return p.id;
  });
  return get(id);
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof updatePositionBody>) {
  await assertDepartment(body.departmentId);
  await prisma.$transaction(async (tx) => {
    const before = await positions.findById(id, tx);
    if (!before) throw notFound();
    if (body.departmentId && body.departmentId !== before.departmentId && (await positions.employeeCount(id, tx)) > 0) throw conflict('errors.position.inUse');
    const after = await positions.update(id, body, tx);
    await audit(tx, auth, { action: 'position.update', entity: 'position', entityId: id, before, after });
  });
  return get(id);
}

export async function remove(auth: AuthContext, id: string) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockRows(tx, 'positions', [id])).length) throw notFound();
    const before = await positions.findById(id, tx);
    if ((await positions.employeeCount(id, tx)) > 0) throw conflict('errors.position.inUse');
    await positions.remove(id, tx);
    await audit(tx, auth, { action: 'position.delete', entity: 'position', entityId: id, before });
  });
}
