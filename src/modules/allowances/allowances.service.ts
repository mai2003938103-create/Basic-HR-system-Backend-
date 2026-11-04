import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';
import type { AuthContext } from '../../utils/auth-context.js';
import { audit } from '../../utils/audit.js';
import { fieldError, notFound } from '../../utils/errors.js';
import { canAccessEmployee } from '../../utils/scope.js';

export const allowanceTypeDto = (t: typeof s.allowanceTypes.$inferSelect) => ({ id: t.id, code: t.code, nameLo: t.nameLo, nameEn: t.nameEn, taxable: t.taxable, isActive: t.isActive });

async function employeeInScope(auth: AuthContext, id: string) {
  const [e] = await db.select({ id: s.employees.id, departmentId: s.employees.departmentId }).from(s.employees).where(eq(s.employees.id, id));
  if (!e || !canAccessEmployee(auth, e)) throw notFound();
  return e;
}

async function rows(employeeId: string) {
  const r = await db
    .select({ amount: s.employeeAllowances.amount, t: s.allowanceTypes })
    .from(s.employeeAllowances)
    .innerJoin(s.allowanceTypes, eq(s.allowanceTypes.id, s.employeeAllowances.allowanceTypeId))
    .where(eq(s.employeeAllowances.employeeId, employeeId))
    .orderBy(asc(s.allowanceTypes.code));
  return r.map(({ amount, t }) => ({ typeId: t.id, code: t.code, nameLo: t.nameLo, nameEn: t.nameEn, taxable: t.taxable, amount }));
}

export async function listForEmployee(auth: AuthContext, employeeId: string) {
  await employeeInScope(auth, employeeId);
  return rows(employeeId);
}

/** Replaces the whole set; an amount of 0 leaves the type out. */
export async function replaceForEmployee(auth: AuthContext, employeeId: string, items: { typeId: string; amount: number }[]) {
  await employeeInScope(auth, employeeId);
  const keep = new Map(items.filter((i) => i.amount > 0).map((i) => [i.typeId, i.amount]));
  if (keep.size) {
    const known = await db.select({ id: s.allowanceTypes.id }).from(s.allowanceTypes).where(inArray(s.allowanceTypes.id, [...keep.keys()]));
    if (known.length !== keep.size) throw fieldError('items', 'errors.common.notFound');
  }
  const before = await rows(employeeId);
  await db.transaction(async (tx) => {
    await tx.delete(s.employeeAllowances).where(eq(s.employeeAllowances.employeeId, employeeId));
    if (keep.size) await tx.insert(s.employeeAllowances).values([...keep].map(([allowanceTypeId, amount]) => ({ employeeId, allowanceTypeId, amount })));
    await audit(tx, auth, { action: 'employee.allowances', entity: 'employee', entityId: employeeId, before, after: [...keep].map(([typeId, amount]) => ({ typeId, amount })) });
  });
  return rows(employeeId);
}

export const listTypes = async () => (await db.select().from(s.allowanceTypes).orderBy(asc(s.allowanceTypes.code))).map(allowanceTypeDto);

export async function createType(auth: AuthContext, body: typeof s.allowanceTypes.$inferInsert) {
  const [t] = await db.insert(s.allowanceTypes).values(body).returning();
  await audit(db, auth, { action: 'allowanceType.create', entity: 'allowance_type', entityId: t.id, after: t });
  return allowanceTypeDto(t);
}

export async function updateType(auth: AuthContext, id: string, body: Partial<typeof s.allowanceTypes.$inferInsert>) {
  const [before] = await db.select().from(s.allowanceTypes).where(eq(s.allowanceTypes.id, id));
  if (!before) throw notFound();
  const [t] = await db.update(s.allowanceTypes).set(body).where(and(eq(s.allowanceTypes.id, id))).returning();
  await audit(db, auth, { action: 'allowanceType.update', entity: 'allowance_type', entityId: id, before, after: t });
  return allowanceTypeDto(t);
}
