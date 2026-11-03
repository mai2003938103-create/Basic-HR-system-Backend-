import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';
import type { AuthContext } from '../../lib/auth-context.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { likeEscape } from '../../lib/http.js';
import { page, toPaging } from '../../lib/list-query.js';
import type { createPositionBody, listPositionsQuery, updatePositionBody } from './positions.schema.js';

const employeeCount = sql<number>`(select count(*)::int from ${s.employees} where ${s.employees.positionId} = ${s.positions.id} and ${s.employees.employmentStatus} not in ('inactive','terminated'))`;

const select = {
  id: s.positions.id,
  code: s.positions.code,
  nameLo: s.positions.nameLo,
  nameEn: s.positions.nameEn,
  description: s.positions.description,
  isActive: s.positions.isActive,
  departmentId: s.departments.id,
  departmentNameLo: s.departments.nameLo,
  departmentNameEn: s.departments.nameEn,
  employeeCount,
};
const toDto = (r: any) => ({
  id: r.id,
  code: r.code,
  nameLo: r.nameLo,
  nameEn: r.nameEn,
  description: r.description,
  isActive: r.isActive,
  department: { id: r.departmentId, nameLo: r.departmentNameLo, nameEn: r.departmentNameEn },
  employeeCount: Number(r.employeeCount),
});

const base = () => db.select(select).from(s.positions).innerJoin(s.departments, eq(s.departments.id, s.positions.departmentId));

export async function list(q: z.infer<typeof listPositionsQuery>) {
  const conds: (SQL | undefined)[] = [];
  if (q.search) {
    const p = `%${likeEscape(q.search)}%`;
    conds.push(or(ilike(s.positions.code, p), ilike(s.positions.nameLo, p), ilike(s.positions.nameEn, p)));
  }
  if (q.isActive !== undefined) conds.push(eq(s.positions.isActive, q.isActive));
  if (q.departmentId) conds.push(eq(s.positions.departmentId, q.departmentId));
  const where = and(...conds);
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const col = s.positions[sortField as 'code'];
  const rows = await base().where(where).orderBy(sortDir === 'asc' ? asc(col) : desc(col), asc(s.positions.id)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(s.positions).where(where);
  return page(rows.map(toDto), total, q);
}

export async function get(id: string) {
  const [row] = await base().where(eq(s.positions.id, id));
  if (!row) throw notFound();
  return toDto(row);
}

async function assertDepartment(id: string | undefined) {
  if (!id) return;
  const [d] = await db.select({ id: s.departments.id }).from(s.departments).where(eq(s.departments.id, id));
  if (!d) throw badRequest('errors.position.invalidDepartment', [{ field: 'departmentId', message: 'errors.position.invalidDepartment' }]);
}

export async function create(auth: AuthContext, body: z.infer<typeof createPositionBody>) {
  await assertDepartment(body.departmentId);
  const id = await db.transaction(async (tx) => {
    const [p] = await tx.insert(s.positions).values(body).returning();
    await audit(tx, auth, { action: 'position.create', entity: 'position', entityId: p.id, after: p });
    return p.id;
  });
  return get(id);
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof updatePositionBody>) {
  await assertDepartment(body.departmentId);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.positions).where(eq(s.positions.id, id));
    if (!before) throw notFound();
    if (body.departmentId && body.departmentId !== before.departmentId) {
      const [{ n }] = await tx.select({ n: count() }).from(s.employees).where(eq(s.employees.positionId, id));
      if (n > 0) throw conflict('errors.position.inUse');
    }
    const [after] = await tx.update(s.positions).set(body).where(eq(s.positions.id, id)).returning();
    await audit(tx, auth, { action: 'position.update', entity: 'position', entityId: id, before, after });
  });
  return get(id);
}

export async function remove(auth: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.positions).where(eq(s.positions.id, id)).for('update');
    if (!before) throw notFound();
    const [{ n }] = await tx.select({ n: count() }).from(s.employees).where(eq(s.employees.positionId, id));
    if (n > 0) throw conflict('errors.position.inUse');
    await tx.delete(s.positions).where(eq(s.positions.id, id));
    await audit(tx, auth, { action: 'position.delete', entity: 'position', entityId: id, before });
  });
}
