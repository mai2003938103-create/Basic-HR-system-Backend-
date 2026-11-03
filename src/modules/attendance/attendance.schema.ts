import { z } from 'zod';
import { listQuerySchema } from '../../lib/list-query.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'errors.validation.date');
export const STATUSES = ['present', 'late', 'absent', 'half_day', 'leave'] as const;

const filters = {
  from: day.optional(),
  to: day.optional(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: z.enum(STATUSES).optional(),
};
export const listAttendanceQuery = listQuerySchema(['workDate', 'checkInAt'], 'workDate:desc').extend(filters);
export const exportAttendanceQuery = z.object({ ...filters, lang: z.enum(['lo', 'en']).default('lo') });
export const editAttendanceBody = z.object({
  checkInAt: z.string().datetime({ offset: true }).nullish(),
  checkOutAt: z.string().datetime({ offset: true }).nullish(),
  status: z.enum(STATUSES).optional(),
  note: z.string().trim().min(1, 'errors.attendance.noteRequired').max(500),
});
