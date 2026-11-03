import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { db, type DbOrTx, type Tx } from '../../db/client.js';
import * as s from '../../db/schema.js';
import { userIdsWithPermission, type AuthContext } from '../../lib/auth-context.js';
import { audit } from '../../lib/audit.js';
import { localDate, yearOf } from '../../lib/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { page, toPaging } from '../../lib/list-query.js';
import { canAccessEmployee, employeeScopeWhere } from '../../lib/scope.js';
import { leaveDaysByYear, workingDates, type LeaveRange } from '../../lib/workdays.js';
import { leaveTypeDto } from '../leave-types/leave-types.routes.js';
import { notify, userIdOfEmployee } from '../notifications/notifications.service.js';
import { getSettings, holidaySet } from '../settings/settings.service.js';
import type { balancesQuery, createLeaveBody, listLeaveQuery } from './leave.schema.js';

type Req = typeof s.leaveRequests.$inferSelect;

async function splitDays(r: LeaveRange) {
  const st = await getSettings();
  const holidays = await holidaySet(r.startDate, r.endDate);
  return { byYear: leaveDaysByYear(r, st.workingDays, holidays), dates: workingDates(r, st.workingDays, holidays) };
}

export async function getOrCreateBalance(tx: DbOrTx, employeeId: string, leaveTypeId: string, year: number, lock = false) {
  const [lt] = await tx.select().from(s.leaveTypes).where(eq(s.leaveTypes.id, leaveTypeId));
  await tx.insert(s.leaveBalances).values({ employeeId, leaveTypeId, year, entitledDays: lt.defaultDaysPerYear }).onConflictDoNothing();
  const q = tx.select().from(s.leaveBalances).where(and(eq(s.leaveBalances.employeeId, employeeId), eq(s.leaveBalances.leaveTypeId, leaveTypeId), eq(s.leaveBalances.year, year)));
  const [b] = lock ? await q.for('update') : await q;
  return b;
}

const remaining = (b: typeof s.leaveBalances.$inferSelect) => Number(b.entitledDays) - Number(b.usedDays);

async function assertBalance(tx: DbOrTx, employeeId: string, leaveType: typeof s.leaveTypes.$inferSelect, byYear: Map<number, number>, lock = false) {
  if (!leaveType.isPaid) return;
  for (const [year, days] of byYear) {
    if (days === 0) continue;
    const b = await getOrCreateBalance(tx, employeeId, leaveType.id, year, lock);
    if (remaining(b) < days) throw badRequest('errors.leave.insufficientBalance');
  }
}

/** Department manager, or HR when there is none or the requester is the manager. */
export async function resolveApprover(tx: DbOrTx, emp: { id: string; departmentId: string }) {
  const [d] = await tx.select({ managerId: s.departments.managerId }).from(s.departments).where(eq(s.departments.id, emp.departmentId));
  const managerId = d?.managerId && d.managerId !== emp.id ? d.managerId : null;
  return { employeeId: managerId, viaHr: !managerId };
}

function canDecide(auth: AuthContext, r: { employeeId: string; departmentId: string; status: string }, managerId: string | null) {
  if (r.status !== 'pending' || !auth.permissions.has('leave.approve')) return false;
  if (auth.employeeId === r.employeeId) return false;
  if (auth.scope === 'all') return true;
  return auth.scope === 'department' && auth.managedDepartmentIds.includes(r.departmentId) && managerId === auth.employeeId;
}

function canCancel(auth: AuthContext, r: Req) {
  const owner = auth.employeeId === r.employeeId;
  if (!owner && !auth.permissions.has('leave.manage')) return false;
  if (r.status === 'pending') return true;
  return r.status === 'approved' && r.startDate > localDate(new Date());
}

const select = {
  r: s.leaveRequests,
  employee: { id: s.employees.id, firstName: s.employees.firstName, lastName: s.employees.lastName, employeeCode: s.employees.employeeCode, departmentId: s.employees.departmentId },
  leaveType: { id: s.leaveTypes.id, code: s.leaveTypes.code, nameLo: s.leaveTypes.nameLo, nameEn: s.leaveTypes.nameEn },
  managerId: s.departments.managerId,
};
const joined = () =>
  db
    .select(select)
    .from(s.leaveRequests)
    .innerJoin(s.employees, eq(s.employees.id, s.leaveRequests.employeeId))
    .innerJoin(s.leaveTypes, eq(s.leaveTypes.id, s.leaveRequests.leaveTypeId))
    .innerJoin(s.departments, eq(s.departments.id, s.employees.departmentId));

type Joined = Awaited<ReturnType<ReturnType<typeof joined>['execute']>>[number];

async function toDtos(auth: AuthContext, rows: Joined[]) {
  const approverIds = [...new Set(rows.map((x) => x.r.approverId).filter(Boolean))] as string[];
  const approvers = approverIds.length
    ? await db.select({ id: s.employees.id, firstName: s.employees.firstName, lastName: s.employees.lastName }).from(s.employees).where(inArray(s.employees.id, approverIds))
    : [];
  const byId = new Map(approvers.map((a) => [a.id, a]));
  return rows.map((x) => ({
    id: x.r.id,
    employee: x.employee,
    leaveType: x.leaveType,
    startDate: x.r.startDate,
    endDate: x.r.endDate,
    halfDay: x.r.halfDay,
    days: Number(x.r.days),
    reason: x.r.reason,
    documentUrl: x.r.documentUrl,
    status: x.r.status,
    approver: x.r.approverId ? (byId.get(x.r.approverId) ?? null) : null,
    decidedAt: x.r.decidedAt,
    decisionNote: x.r.decisionNote,
    createdAt: x.r.createdAt,
    canApprove: canDecide(auth, { employeeId: x.r.employeeId, departmentId: x.employee.departmentId, status: x.r.status }, x.managerId),
    canCancel: canCancel(auth, x.r),
  }));
}

export async function get(auth: AuthContext, id: string) {
  const [row] = await joined().where(eq(s.leaveRequests.id, id));
  if (!row || !canAccessEmployee(auth, row.employee)) throw notFound();
  return (await toDtos(auth, [row]))[0];
}

export async function list(auth: AuthContext, q: z.infer<typeof listLeaveQuery>) {
  const conds: (SQL | undefined)[] = [employeeScopeWhere(auth)];
  if (q.mine) conds.push(auth.employeeId ? eq(s.leaveRequests.employeeId, auth.employeeId) : sql`false`);
  if (q.toApprove) {
    conds.push(eq(s.leaveRequests.status, 'pending'));
    conds.push(auth.employeeId ? ne(s.leaveRequests.employeeId, auth.employeeId) : undefined);
    if (!auth.permissions.has('leave.approve')) conds.push(sql`false`);
    else if (auth.scope !== 'all') conds.push(auth.employeeId ? eq(s.departments.managerId, auth.employeeId) : sql`false`);
  }
  if (q.status) conds.push(eq(s.leaveRequests.status, q.status));
  if (q.employeeId) conds.push(eq(s.leaveRequests.employeeId, q.employeeId));
  if (q.departmentId) conds.push(eq(s.employees.departmentId, q.departmentId));
  if (q.leaveTypeId) conds.push(eq(s.leaveRequests.leaveTypeId, q.leaveTypeId));
  if (q.from) conds.push(gte(s.leaveRequests.endDate, q.from));
  if (q.to) conds.push(lte(s.leaveRequests.startDate, q.to));
  const where = and(...conds);
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const col = s.leaveRequests[sortField as 'createdAt'];
  const rows = await joined().where(where).orderBy(sortDir === 'asc' ? asc(col) : desc(col), asc(s.leaveRequests.id)).limit(limit).offset(offset);
  const [{ total }] = await db
    .select({ total: count() })
    .from(s.leaveRequests)
    .innerJoin(s.employees, eq(s.employees.id, s.leaveRequests.employeeId))
    .innerJoin(s.departments, eq(s.departments.id, s.employees.departmentId))
    .where(where);
  return page(await toDtos(auth, rows), total, q);
}

export async function create(auth: AuthContext, body: z.infer<typeof createLeaveBody>, documentUrl: string | null) {
  if (!auth.employeeId) throw badRequest('errors.attendance.noEmployee');
  const employeeId = auth.employeeId;
  if (body.endDate < body.startDate) throw badRequest('errors.leave.invalidRange', [{ field: 'endDate', message: 'errors.leave.invalidRange' }]);
  if (body.halfDay !== 'none' && body.startDate !== body.endDate) throw badRequest('errors.leave.halfDaySingleDate', [{ field: 'halfDay', message: 'errors.leave.halfDaySingleDate' }]);
  const [lt] = await db.select().from(s.leaveTypes).where(and(eq(s.leaveTypes.id, body.leaveTypeId), eq(s.leaveTypes.isActive, true)));
  if (!lt) throw badRequest('errors.leave.invalidType', [{ field: 'leaveTypeId', message: 'errors.leave.invalidType' }]);
  const { byYear } = await splitDays(body);
  const days = [...byYear.values()].reduce((a, b) => a + b, 0);
  if (days === 0) throw badRequest('errors.leave.zeroDays');
  if (lt.documentRequiredAfterDays != null && days > lt.documentRequiredAfterDays && !documentUrl) {
    throw badRequest('errors.leave.documentRequired', [{ field: 'document', message: 'errors.leave.documentRequired' }]);
  }

  const id = await db.transaction(async (tx) => {
    const [emp] = await tx.select().from(s.employees).where(eq(s.employees.id, employeeId)).for('update');
    const [overlap] = await tx
      .select({ id: s.leaveRequests.id })
      .from(s.leaveRequests)
      .where(
        and(
          eq(s.leaveRequests.employeeId, employeeId),
          inArray(s.leaveRequests.status, ['pending', 'approved']),
          lte(s.leaveRequests.startDate, body.endDate),
          gte(s.leaveRequests.endDate, body.startDate),
        ),
      )
      .limit(1);
    if (overlap) throw conflict('errors.leave.overlap');
    await assertBalance(tx, employeeId, lt, byYear);
    const approver = await resolveApprover(tx, emp);
    const [r] = await tx
      .insert(s.leaveRequests)
      .values({ ...body, employeeId, days: String(days), documentUrl, approverId: approver.employeeId })
      .returning();
    const targets = approver.viaHr ? await userIdsWithPermission('leave.manage') : [await userIdOfEmployee(tx, approver.employeeId)];
    await notify(tx, targets.filter((t): t is string => !!t && t !== auth.userId), 'leave.requested', 'notifications.leaveRequested', {
      leaveRequestId: r.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      startDate: r.startDate,
      endDate: r.endDate,
    });
    await audit(tx, auth, { action: 'leave.create', entity: 'leave_request', entityId: r.id, after: r });
    return r.id;
  });
  return get(auth, id);
}

async function lockRequest(tx: Tx, id: string) {
  const [r] = await tx.select().from(s.leaveRequests).where(eq(s.leaveRequests.id, id)).for('update');
  if (!r) throw notFound();
  const [emp] = await tx.select().from(s.employees).where(eq(s.employees.id, r.employeeId));
  const [d] = await tx.select({ managerId: s.departments.managerId }).from(s.departments).where(eq(s.departments.id, emp.departmentId));
  return { r, emp, managerId: d?.managerId ?? null };
}

async function decide(auth: AuthContext, id: string, approve: boolean, note: string | undefined) {
  await db.transaction(async (tx) => {
    const { r, emp, managerId } = await lockRequest(tx, id);
    if (!canAccessEmployee(auth, emp)) throw notFound();
    if (auth.employeeId === r.employeeId) throw forbidden('errors.leave.ownRequest');
    if (r.status !== 'pending') throw conflict('errors.leave.notPending');
    if (!canDecide(auth, { employeeId: r.employeeId, departmentId: emp.departmentId, status: r.status }, managerId)) throw forbidden();

    if (approve) {
      const [lt] = await tx.select().from(s.leaveTypes).where(eq(s.leaveTypes.id, r.leaveTypeId));
      const { byYear, dates } = await splitDays(r);
      await assertBalance(tx, r.employeeId, lt, byYear, true);
      for (const [year, days] of byYear) {
        if (days === 0) continue;
        const b = await getOrCreateBalance(tx, r.employeeId, lt.id, year, true);
        await tx.update(s.leaveBalances).set({ usedDays: sql`${s.leaveBalances.usedDays} + ${days}` }).where(eq(s.leaveBalances.id, b.id));
      }
      if (dates.length) {
        await tx
          .insert(s.attendance)
          .values(dates.map((workDate) => ({ employeeId: r.employeeId, workDate, status: 'leave' as const, note: 'leave' })))
          .onConflictDoUpdate({
            target: [s.attendance.employeeId, s.attendance.workDate],
            set: { status: 'leave' },
            setWhere: isNull(s.attendance.checkInAt),
          });
      }
    }
    const [after] = await tx
      .update(s.leaveRequests)
      .set({ status: approve ? 'approved' : 'rejected', decidedAt: new Date(), decisionNote: note ?? null, approverId: auth.employeeId ?? r.approverId })
      .where(eq(s.leaveRequests.id, id))
      .returning();
    await notify(tx, (await userIdOfEmployee(tx, r.employeeId)) ?? [], approve ? 'leave.approved' : 'leave.rejected', approve ? 'notifications.leaveApproved' : 'notifications.leaveRejected', {
      leaveRequestId: id,
      startDate: r.startDate,
      endDate: r.endDate,
      note: note ?? null,
    });
    await audit(tx, auth, { action: approve ? 'leave.approve' : 'leave.reject', entity: 'leave_request', entityId: id, before: r, after });
  });
  return get(auth, id);
}

export const approve = (auth: AuthContext, id: string, note?: string) => decide(auth, id, true, note);
export const reject = (auth: AuthContext, id: string, note: string) => decide(auth, id, false, note);

export async function cancel(auth: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const { r, emp } = await lockRequest(tx, id);
    if (!canAccessEmployee(auth, emp)) throw notFound();
    if (auth.employeeId !== r.employeeId && !auth.permissions.has('leave.manage')) throw forbidden();
    if (!canCancel(auth, r)) throw conflict('errors.leave.cannotCancel');
    if (r.status === 'approved') {
      const { byYear, dates } = await splitDays(r);
      for (const [year, days] of byYear) {
        if (days === 0) continue;
        const b = await getOrCreateBalance(tx, r.employeeId, r.leaveTypeId, year, true);
        await tx.update(s.leaveBalances).set({ usedDays: sql`greatest(${s.leaveBalances.usedDays} - ${days}, 0)` }).where(eq(s.leaveBalances.id, b.id));
      }
      if (dates.length) {
        await tx
          .delete(s.attendance)
          .where(and(eq(s.attendance.employeeId, r.employeeId), inArray(s.attendance.workDate, dates), eq(s.attendance.status, 'leave'), isNull(s.attendance.checkInAt)));
      }
    }
    const [after] = await tx.update(s.leaveRequests).set({ status: 'cancelled' }).where(eq(s.leaveRequests.id, id)).returning();
    await audit(tx, auth, { action: 'leave.cancel', entity: 'leave_request', entityId: id, before: r, after });
  });
  return get(auth, id);
}

const balanceDto = (b: typeof s.leaveBalances.$inferSelect, lt: typeof s.leaveTypes.$inferSelect) => ({
  id: b.id,
  employeeId: b.employeeId,
  year: b.year,
  leaveType: leaveTypeDto(lt),
  entitledDays: Number(b.entitledDays),
  usedDays: Number(b.usedDays),
  remainingDays: remaining(b),
});

export async function balances(auth: AuthContext, q: z.infer<typeof balancesQuery>) {
  const employeeId = q.employeeId ?? auth.employeeId;
  if (!employeeId) throw badRequest('errors.attendance.noEmployee');
  const [emp] = await db.select({ id: s.employees.id, departmentId: s.employees.departmentId }).from(s.employees).where(eq(s.employees.id, employeeId));
  if (!emp || !canAccessEmployee(auth, emp)) throw notFound();
  const year = q.year ?? yearOf(localDate(new Date()));
  const types = await db.select().from(s.leaveTypes).where(eq(s.leaveTypes.isActive, true)).orderBy(asc(s.leaveTypes.code));
  const out = [];
  for (const lt of types) out.push(balanceDto(await getOrCreateBalance(db, employeeId, lt.id, year), lt));
  return out;
}

export async function updateBalance(auth: AuthContext, id: string, entitledDays: number) {
  const [before] = await db.select().from(s.leaveBalances).where(eq(s.leaveBalances.id, id));
  if (!before) throw notFound();
  const [after] = await db.update(s.leaveBalances).set({ entitledDays: String(entitledDays) }).where(eq(s.leaveBalances.id, id)).returning();
  const [lt] = await db.select().from(s.leaveTypes).where(eq(s.leaveTypes.id, after.leaveTypeId));
  await audit(db, auth, { action: 'leave.balance', entity: 'leave_balance', entityId: id, before, after });
  return balanceDto(after, lt);
}

/** Document download rule: the owner, or anyone in scope who can approve/manage leave. */
export async function canReadLeaveDocument(auth: AuthContext, key: string) {
  const [row] = await db
    .select({ employeeId: s.leaveRequests.employeeId, departmentId: s.employees.departmentId })
    .from(s.leaveRequests)
    .innerJoin(s.employees, eq(s.employees.id, s.leaveRequests.employeeId))
    .where(eq(s.leaveRequests.documentUrl, `/api/files/${key}`));
  if (!row) return false;
  if (auth.employeeId === row.employeeId) return true;
  const canReview = auth.permissions.has('leave.approve') || auth.permissions.has('leave.manage');
  return canReview && canAccessEmployee(auth, { id: row.employeeId, departmentId: row.departmentId });
}

