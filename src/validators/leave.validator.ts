import { z } from 'zod';
import { boolQuery } from '../utils/http.js';
import { listQuerySchema } from '../utils/list-query.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'errors.validation.date');

export const createLeaveBody = z.object({
  leaveTypeId: z.string().uuid('errors.validation.required'),
  startDate: day,
  endDate: day,
  halfDay: z.enum(['none', 'morning', 'afternoon']).default('none'),
  reason: z.string().trim().min(1, 'errors.validation.required').max(1000),
});
export const listLeaveQuery = listQuerySchema(['createdAt', 'startDate'], 'createdAt:desc').extend({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid().optional(),
  from: day.optional(),
  to: day.optional(),
  mine: boolQuery,
  toApprove: boolQuery,
});
export const approveBody = z.object({ note: z.string().trim().max(500).optional() });
export const rejectBody = z.object({ note: z.string().trim().min(1, 'errors.leave.reasonRequired').max(500) });
export const balancesQuery = z.object({
  employeeId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export const balanceUpdateBody = z.object({ entitledDays: z.coerce.number().min(0).max(366) });
