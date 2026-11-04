import type { LeaveType } from '../generated/prisma/client.js';

export const leaveTypeView = (t: LeaveType) => ({
  id: t.id,
  code: t.code,
  nameLo: t.nameLo,
  nameEn: t.nameEn,
  defaultDaysPerYear: t.defaultDaysPerYear.toNumber(),
  isPaid: t.isPaid,
  documentRequiredAfterDays: t.documentRequiredAfterDays,
  isActive: t.isActive,
});
