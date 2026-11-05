import type { z } from 'zod';
import * as allowances from '../models/allowance.model.js';
import { prisma, withTx } from '../models/prisma.js';
import type { AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { fieldError, notFound } from '../utils/errors.js';
import { canAccessEmployee } from '../utils/scope.js';
import type { allowanceTypeBody } from '../validators/allowances.validator.js';
import { allowanceTypeView, employeeAllowanceView } from '../views/allowance.view.js';

async function employeeInScope(auth: AuthContext, id: string) {
  const e = await prisma.employee.findUnique({ where: { id }, select: { id: true, departmentId: true } });
  if (!e || !canAccessEmployee(auth, e)) throw notFound();
  return e;
}

const rows = async (employeeId: string) => (await allowances.forEmployee(employeeId)).map(employeeAllowanceView);

export async function listForEmployee(auth: AuthContext, employeeId: string) {
  await employeeInScope(auth, employeeId);
  return rows(employeeId);
}

/** Replaces the whole set; an amount of 0 leaves the type out. */
export async function replaceForEmployee(auth: AuthContext, employeeId: string, items: { typeId: string; amount: number }[]) {
  await employeeInScope(auth, employeeId);
  const keep = new Map(items.filter((i) => i.amount > 0).map((i) => [i.typeId, i.amount]));
  if (keep.size && (await allowances.countTypes([...keep.keys()])) !== keep.size) throw fieldError('items', 'errors.common.notFound');
  const before = await rows(employeeId);
  await withTx(async (tx) => {
    await allowances.replaceForEmployee(employeeId, [...keep], tx);
    await audit(tx, auth, { action: 'employee.allowances', entity: 'employee', entityId: employeeId, before, after: [...keep].map(([typeId, amount]) => ({ typeId, amount })) });
  });
  return rows(employeeId);
}

export const listTypes = async () => (await allowances.listTypes()).map(allowanceTypeView);

export async function createType(auth: AuthContext, body: z.infer<typeof allowanceTypeBody>) {
  const t = await allowances.createType(body);
  await audit(prisma, auth, { action: 'allowanceType.create', entity: 'allowance_type', entityId: t.id, after: t });
  return allowanceTypeView(t);
}

export async function updateType(auth: AuthContext, id: string, body: Partial<z.infer<typeof allowanceTypeBody>>) {
  const before = await allowances.findType(id);
  if (!before) throw notFound();
  const t = await allowances.updateType(id, body);
  await audit(prisma, auth, { action: 'allowanceType.update', entity: 'allowance_type', entityId: id, before, after: t });
  return allowanceTypeView(t);
}
