import { and, eq, gte, inArray, lte, notExists, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as s from '../db/schema.js';
import { isWorkingDay } from '../utils/workdays.js';
import { getSettings, holidaySet } from '../modules/settings/settings.service.js';

/** Creates `absent` rows for active employees with no attendance and no approved leave on `date`. Idempotent. */
export async function markAbsences(date: string): Promise<{ created: number }> {
  const st = await getSettings();
  if (!isWorkingDay(date, st.workingDays, await holidaySet(date, date))) return { created: 0 };
  const candidates = await db
    .select({ id: s.employees.id })
    .from(s.employees)
    .where(
      and(
        inArray(s.employees.employmentStatus, ['active', 'probation']),
        lte(s.employees.hireDate, date),
        notExists(db.select({ x: sql`1` }).from(s.attendance).where(and(eq(s.attendance.employeeId, s.employees.id), eq(s.attendance.workDate, date)))),
        notExists(
          db
            .select({ x: sql`1` })
            .from(s.leaveRequests)
            .where(and(eq(s.leaveRequests.employeeId, s.employees.id), eq(s.leaveRequests.status, 'approved'), lte(s.leaveRequests.startDate, date), gte(s.leaveRequests.endDate, date))),
        ),
      ),
    );
  if (!candidates.length) return { created: 0 };
  const inserted = await db
    .insert(s.attendance)
    .values(candidates.map((c) => ({ employeeId: c.id, workDate: date, status: 'absent' as const })))
    .onConflictDoNothing()
    .returning({ id: s.attendance.id });
  return { created: inserted.length };
}
