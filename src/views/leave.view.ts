import type { LeaveType } from '../generated/prisma/client.js';
import { toLeaveRow, type LeaveBalanceRow, type LeaveRequestWithRelations } from '../models/leave.model.js';
import { leaveTypeView } from './leave-type.view.js';

export function leaveRequestView(x: LeaveRequestWithRelations, flags: { canApprove: boolean; canCancel: boolean }) {
  const r = toLeaveRow(x);
  const { department: _d, ...employee } = x.employee;
  return {
    id: r.id,
    employee,
    leaveType: x.leaveType,
    startDate: r.startDate,
    endDate: r.endDate,
    halfDay: r.halfDay,
    days: r.days,
    reason: r.reason,
    documentUrl: r.documentUrl,
    status: r.status,
    approver: x.approver ?? null,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt,
    canApprove: flags.canApprove,
    canCancel: flags.canCancel,
  };
}

export const leaveBalanceView = (b: LeaveBalanceRow, lt: LeaveType) => ({
  id: b.id,
  employeeId: b.employeeId,
  year: b.year,
  leaveType: leaveTypeView(lt),
  entitledDays: b.entitledDays,
  usedDays: b.usedDays,
  remainingDays: b.entitledDays - b.usedDays,
});
