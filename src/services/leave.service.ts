import type { z } from 'zod';
import type { LeaveType, Prisma } from '../generated/prisma/client.js';
import * as attendance from '../models/attendance.model.js';
import * as leave from '../models/leave.model.js';
import * as leaveTypes from '../models/leave-type.model.js';
import { fromDateString } from '../models/mappers.js';
import { prisma, type Db, withTx } from '../models/prisma.js';
import { userIdsWithPermission, type AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { localDate, yearOf } from '../utils/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { page, toPaging } from '../utils/list-query.js';
import { lockRows } from '../utils/lock.js';
import { canAccessEmployee, employeeScopeWhere } from '../utils/scope.js';
import { leaveDaysByYear, workingDates, type LeaveRange } from '../utils/workdays.js';
import type { balancesQuery, createLeaveBody, listLeaveQuery } from '../validators/leave.validator.js';
import { leaveBalanceView, leaveRequestView } from '../views/leave.view.js';
import { notify, userIdOfEmployee } from './notifications.service.js';
import { getSettings, holidaySet } from './settings.service.js';

async function splitDays(r: LeaveRange) {
  const st = await getSettings();
  const holidays = await holidaySet(r.startDate, r.endDate);
  return { byYear: leaveDaysByYear(r, st.workingDays, holidays), dates: workingDates(r, st.workingDays, holidays) };
}

export async function getOrCreateBalance(tx: Db, employeeId: string, leaveTypeId: string, year: number, lock = false) {
  const lt = (await leaveTypes.findById(leaveTypeId, tx))!;
  const b = await leave.ensureBalance(employeeId, leaveTypeId, year, lt.defaultDaysPerYear, tx);
  if (!lock) return b;
  await lockRows(tx as Prisma.TransactionClient, 'leave_balances', [b.id]);
  return (await leave.findBalance(b.id, tx))!;
}

const remaining = (b: leave.LeaveBalanceRow) => b.entitledDays - b.usedDays;

async function assertBalance(tx: Db, employeeId: string, leaveType: LeaveType, byYear: Map<number, number>, lock = false) {
  if (!leaveType.isPaid) return;
  for (const [year, days] of byYear) {
    if (days === 0) continue;
    const b = await getOrCreateBalance(tx, employeeId, leaveType.id, year, lock);
    if (remaining(b) < days) throw badRequest('errors.leave.insufficientBalance');
  }
}

/** Department manager, or HR when there is none or the requester is the manager. */
export async function resolveApprover(tx: Db, emp: { id: string; departmentId: string }) {
  const d = await tx.department.findUnique({ where: { id: emp.departmentId }, select: { managerId: true } });
  const managerId = d?.managerId && d.managerId !== emp.id ? d.managerId : null;
  return { employeeId: managerId, viaHr: !managerId };
}

function canDecide(auth: AuthContext, r: { employeeId: string; departmentId: string; status: string }, managerId: string | null) {
  if (r.status !== 'pending' || !auth.permissions.has('leave.approve')) return false;
  if (auth.employeeId === r.employeeId) return false;
  if (auth.scope === 'all') return true;
  return auth.scope === 'department' && auth.managedDepartmentIds.includes(r.departmentId) && managerId === auth.employeeId;
}

function canCancel(auth: AuthContext, r: { employeeId: string; status: string; startDate: string }) {
  const owner = auth.employeeId === r.employeeId;
  if (!owner && !auth.permissions.has('leave.manage')) return false;
  if (r.status === 'pending') return true;
  return r.status === 'approved' && r.startDate > localDate(new Date());
}

const toDto = (auth: AuthContext, x: leave.LeaveRequestWithRelations) => {
  const row = leave.toLeaveRow(x);
  return leaveRequestView(x, {
    canApprove: canDecide(auth, { employeeId: x.employeeId, departmentId: x.employee.departmentId, status: x.status }, x.employee.department.managerId),
    canCancel: canCancel(auth, row),
  });
};

export async function get(auth: AuthContext, id: string) {
  const row = await leave.findWithRelations(id);
  if (!row || !canAccessEmployee(auth, row.employee)) throw notFound();
  return toDto(auth, row);
}

const NONE: Prisma.LeaveRequestWhereInput = { id: { in: [] } };

export async function list(auth: AuthContext, q: z.infer<typeof listLeaveQuery>) {
  const conds: Prisma.LeaveRequestWhereInput[] = [];
  const scope = employeeScopeWhere(auth);
  if (scope) conds.push({ employee: scope });
  if (q.mine) conds.push(auth.employeeId ? { employeeId: auth.employeeId } : NONE);
  if (q.toApprove) {
    conds.push({ status: 'pending' });
    if (auth.employeeId) conds.push({ employeeId: { not: auth.employeeId } });
    if (!auth.permissions.has('leave.approve')) conds.push(NONE);
    else if (auth.scope !== 'all') conds.push(auth.employeeId ? { employee: { department: { managerId: auth.employeeId } } } : NONE);
  }
  if (q.status) conds.push({ status: q.status });
  if (q.employeeId) conds.push({ employeeId: q.employeeId });
  if (q.departmentId) conds.push({ employee: { departmentId: q.departmentId } });
  if (q.leaveTypeId) conds.push({ leaveTypeId: q.leaveTypeId });
  if (q.from) conds.push({ endDate: { gte: fromDateString(q.from) } });
  if (q.to) conds.push({ startDate: { lte: fromDateString(q.to) } });
  const { offset, limit, sortField, sortDir } = toPaging(q);
  const { rows, total } = await leave.list({ AND: conds }, [{ [sortField]: sortDir }, { id: 'asc' }], offset, limit);
  return page(rows.map((x) => toDto(auth, x)), total, q);
}

export async function create(auth: AuthContext, body: z.infer<typeof createLeaveBody>, documentUrl: string | null) {
  if (!auth.employeeId) throw badRequest('errors.attendance.noEmployee');
  const employeeId = auth.employeeId;
  if (body.endDate < body.startDate) throw badRequest('errors.leave.invalidRange', [{ field: 'endDate', message: 'errors.leave.invalidRange' }]);
  if (body.halfDay !== 'none' && body.startDate !== body.endDate) throw badRequest('errors.leave.halfDaySingleDate', [{ field: 'halfDay', message: 'errors.leave.halfDaySingleDate' }]);
  const lt = await leaveTypes.findActive(body.leaveTypeId);
  if (!lt) throw badRequest('errors.leave.invalidType', [{ field: 'leaveTypeId', message: 'errors.leave.invalidType' }]);
  const { byYear } = await splitDays(body);
  const days = [...byYear.values()].reduce((a, b) => a + b, 0);
  if (days === 0) throw badRequest('errors.leave.zeroDays');
  if (lt.documentRequiredAfterDays != null && days > lt.documentRequiredAfterDays && !documentUrl) {
    throw badRequest('errors.leave.documentRequired', [{ field: 'document', message: 'errors.leave.documentRequired' }]);
  }

  const id = await withTx(async (tx) => {
    await lockRows(tx, 'employees', [employeeId]);
    const emp = (await tx.employee.findUnique({ where: { id: employeeId } }))!;
    if (await leave.hasOverlap(employeeId, body.startDate, body.endDate, tx)) throw conflict('errors.leave.overlap');
    await assertBalance(tx, employeeId, lt, byYear);
    const approver = await resolveApprover(tx, emp);
    const r = await leave.create({ ...body, employeeId, days, documentUrl, approverId: approver.employeeId }, tx);
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

async function lockRequest(tx: Prisma.TransactionClient, id: string) {
  if (!(await lockRows(tx, 'leave_requests', [id])).length) throw notFound();
  const r = (await leave.findById(id, tx))!;
  const emp = (await tx.employee.findUnique({ where: { id: r.employeeId } }))!;
  const d = await tx.department.findUnique({ where: { id: emp.departmentId }, select: { managerId: true } });
  return { r, emp, managerId: d?.managerId ?? null };
}

async function decide(auth: AuthContext, id: string, approve: boolean, note: string | undefined) {
  await withTx(async (tx) => {
    let charged: Record<string, number> | undefined;
    const { r, emp, managerId } = await lockRequest(tx, id);
    if (!canAccessEmployee(auth, emp)) throw notFound();
    if (auth.employeeId === r.employeeId) throw forbidden('errors.leave.ownRequest');
    if (r.status !== 'pending') throw conflict('errors.leave.notPending');
    if (!canDecide(auth, { employeeId: r.employeeId, departmentId: emp.departmentId, status: r.status }, managerId)) throw forbidden();

    if (approve) {
      const lt = (await leaveTypes.findById(r.leaveTypeId, tx))!;
      const { byYear, dates } = await splitDays(r);
      await assertBalance(tx, r.employeeId, lt, byYear, true);
      charged = Object.fromEntries([...byYear].map(([y, d]) => [String(y), d]));
      for (const [year, days] of byYear) {
        if (days === 0) continue;
        const b = await getOrCreateBalance(tx, r.employeeId, lt.id, year, true);
        await leave.addUsed(b.id, days, tx);
      }
      if (r.halfDay === 'none') await attendance.markLeaveDays(r.employeeId, dates, tx);
    }
    const after = await leave.update(
      id,
      { status: approve ? 'approved' : 'rejected', decidedAt: new Date(), decisionNote: note ?? null, approverId: auth.employeeId ?? r.approverId, ...(charged ? { daysByYear: charged } : {}) },
      tx,
    );
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
  await withTx(async (tx) => {
    const { r, emp } = await lockRequest(tx, id);
    if (!canAccessEmployee(auth, emp)) throw notFound();
    if (auth.employeeId !== r.employeeId && !auth.permissions.has('leave.manage')) throw forbidden();
    if (!canCancel(auth, r)) throw conflict('errors.leave.cannotCancel');
    if (r.status === 'approved') {
      // Refund exactly what approval charged, even if holidays or working days changed since.
      const charged: [number, number][] = r.daysByYear
        ? Object.entries(r.daysByYear as Record<string, number>).map(([y, d]) => [Number(y), d])
        : [...(await splitDays(r)).byYear];
      for (const [year, days] of charged) {
        if (days === 0) continue;
        const b = await getOrCreateBalance(tx, r.employeeId, r.leaveTypeId, year, true);
        await leave.refundUsed(b.id, days, tx);
      }
      await attendance.clearLeaveDays(r.employeeId, r.startDate, r.endDate, tx);
    }
    const after = await leave.update(id, { status: 'cancelled' }, tx);
    await audit(tx, auth, { action: 'leave.cancel', entity: 'leave_request', entityId: id, before: r, after });
  });
  return get(auth, id);
}

export async function balances(auth: AuthContext, q: z.infer<typeof balancesQuery>) {
  const employeeId = q.employeeId ?? auth.employeeId;
  if (!employeeId) throw badRequest('errors.attendance.noEmployee');
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, departmentId: true } });
  if (!emp || !canAccessEmployee(auth, emp)) throw notFound();
  const year = q.year ?? yearOf(localDate(new Date()));
  const out = [];
  for (const lt of await leaveTypes.listActive()) out.push(leaveBalanceView(await getOrCreateBalance(prisma, employeeId, lt.id, year), lt));
  return out;
}

export async function updateBalance(auth: AuthContext, id: string, entitledDays: number) {
  const before = await leave.findBalance(id);
  if (!before) throw notFound();
  const after = await leave.setEntitled(id, entitledDays);
  const lt = (await leaveTypes.findById(after.leaveTypeId))!;
  await audit(prisma, auth, { action: 'leave.balance', entity: 'leave_balance', entityId: id, before, after });
  return leaveBalanceView(after, lt);
}

/** Document download rule: the owner, or anyone in scope who can approve/manage leave. */
export async function canReadLeaveDocument(auth: AuthContext, key: string) {
  const row = await leave.ownerOfDocument(`/api/files/${key}`);
  if (!row) return false;
  if (auth.employeeId === row.employeeId) return true;
  const canReview = auth.permissions.has('leave.approve') || auth.permissions.has('leave.manage');
  return canReview && canAccessEmployee(auth, { id: row.employeeId, departmentId: row.employee.departmentId });
}
