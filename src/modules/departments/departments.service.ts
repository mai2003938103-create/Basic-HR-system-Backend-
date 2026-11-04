import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';
import type { AuthContext } from '../../utils/auth-context.js';
import { audit } from '../../utils/audit.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { likeEscape } from '../../utils/http.js';
import { page, toPaging } from '../../utils/list-query.js';
import type { z } from 'zod';
import type { createDepartmentBody, listDepartmentsQuery, updateDepartmentBody } from './departments.schema.js';

const employeeCount = sql<number>`(select count(*)::int from ${s.employees} where ${s.employees.departmentId} = ${s.departments.id} and ${s.employees.employmentStatus} not in ('inactive','terminated'))`;

const select = {
  id: s.departments.id,
  code: s.departments.code,
  nameLo: s.departments.nameLo,
  nameEn: s.departments.nameEn,
  description: s.departments.description,
  isActive: s.departments.isActive,
  managerId: s.departments.managerId,
  managerFirstName: s.employees.firstName,
  managerLastName: s.employees.lastName,
  employeeCount,
  createdAt: s.departments.createdAt,
};

type Row = { [K in keyof typeof select]: any };
const toDto = (r: Row) => ({
  id: r.id,
  code: r.code,
  nameLo: r.nameLo,
  nameEn: r.nameEn,
  description: r.description,
  isActive: r.isActive,
  manager: r.managerId ? { id: r.managerId, firstName: r.managerFirstName, lastName: r.managerLastName } : null,
  employeeCount: Number(r.employeeCount),
});
export type DepartmentDto = ReturnType<typeof toDto>;

const base = () => db.select(select).from(s.departments).leftJoin(s.employees, eq(s.employees.id, s.departments.managerId));

export async function list(q: z.infer<typeof listDepartmentsQuery>) {
  const conds: (SQL | undefined)[] = [];
  if (q.search) {
    const p = `%${likeEscape(q.search)}%`;
    conds.push(or(ilike(s.departments.code, p), ilike(s.departments.nameLo, p), ilike(s.departments.nameEn, p)));
  }
  if (q.isActive !== undefined) conds.push(eq(s.departments.isActive, q.isActive));
  const where = and(...conds);
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const col = s.departments[sortField as 'code'];
  const rows = await base().where(where).orderBy(sortDir === 'asc' ? asc(col) : desc(col), asc(s.departments.id)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(s.departments).where(where);
  return page(rows.map(toDto), total, q);
}

export async function get(id: string) {
  const [row] = await base().where(eq(s.departments.id, id));
  if (!row) throw notFound();
  return toDto(row);
}

async function assertManager(managerId: string | null | undefined) {
  if (!managerId) return;
  const [m] = await db.select({ status: s.employees.employmentStatus }).from(s.employees).where(eq(s.employees.id, managerId));
  if (!m || m.status === 'inactive' || m.status === 'terminated') {
    throw badRequest('errors.department.invalidManager', [{ field: 'managerId', message: 'errors.department.invalidManager' }]);
  }
}

export async function create(auth: AuthContext, body: z.infer<typeof createDepartmentBody>) {
  await assertManager(body.managerId);
  const id = await db.transaction(async (tx) => {
    const [d] = await tx.insert(s.departments).values(body).returning();
    await audit(tx, auth, { action: 'department.create', entity: 'department', entityId: d.id, after: d });
    return d.id;
  });
  return get(id);
}

export async function update(auth: AuthContext, id: string, body: z.infer<typeof updateDepartmentBody>) {
  await assertManager(body.managerId);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.departments).where(eq(s.departments.id, id));
    if (!before) throw notFound();
    const [after] = await tx.update(s.departments).set(body).where(eq(s.departments.id, id)).returning();
    await audit(tx, auth, { action: 'department.update', entity: 'department', entityId: id, before, after });
  });
  return get(id);
}

export async function remove(auth: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.departments).where(eq(s.departments.id, id)).for('update');
    if (!before) throw notFound();
    const [{ n: emp }] = await tx.select({ n: count() }).from(s.employees).where(eq(s.employees.departmentId, id));
    const [{ n: pos }] = await tx.select({ n: count() }).from(s.positions).where(eq(s.positions.departmentId, id));
    if (emp > 0 || pos > 0) throw conflict('errors.department.inUse');
    await tx.delete(s.departments).where(eq(s.departments.id, id));
    await audit(tx, auth, { action: 'department.delete', entity: 'department', entityId: id, before });
  });
}
