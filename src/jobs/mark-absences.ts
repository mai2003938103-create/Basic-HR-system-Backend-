import { fromDateString } from '../models/mappers.js';
import { prisma } from '../models/prisma.js';
import { getSettings, holidaySet } from '../services/settings.service.js';
import { isWorkingDay } from '../utils/workdays.js';

/** Creates `absent` rows for active employees with no attendance and no approved leave on `date`. Idempotent. */
export async function markAbsences(date: string): Promise<{ created: number }> {
  const st = await getSettings();
  if (!isWorkingDay(date, st.workingDays, await holidaySet(date, date))) return { created: 0 };
  const d = fromDateString(date);
  const candidates = await prisma.employee.findMany({
    where: {
      employmentStatus: { in: ['active', 'probation'] },
      hireDate: { lte: d },
      attendance: { none: { workDate: d } },
      leaveRequests: { none: { status: 'approved', startDate: { lte: d }, endDate: { gte: d } } },
    },
    select: { id: true },
  });
  if (!candidates.length) return { created: 0 };
  const { count } = await prisma.attendance.createMany({ data: candidates.map((c) => ({ employeeId: c.id, workDate: d, status: 'absent' as const })), skipDuplicates: true });
  return { created: count };
}
