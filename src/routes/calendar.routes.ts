import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/calendar.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { holidayBody, holidayQuery, leaveTypeBody } from '../validators/calendar.validator.js';

export function holidayRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('leave.read'), validate({ query: holidayQuery }), c.listHolidays);
  r.post('/', authorize('leave.manage'), validate({ body: holidayBody }), c.addHoliday);
  r.delete('/:id', authorize('leave.manage'), validate({ params: idParams }), c.removeHoliday);
  return r;
}

export function leaveTypeRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('leave.read'), c.listLeaveTypes);
  r.post('/', authorize('leave.manage'), validate({ body: leaveTypeBody }), c.createLeaveType);
  r.put('/:id', authorize('leave.manage'), validate({ params: idParams, body: leaveTypeBody.partial() }), c.updateLeaveType);
  return r;
}

const leaveTypeDoc = z.object({ code: z.string(), nameLo: z.string(), nameEn: z.string(), defaultDaysPerYear: z.number(), isPaid: z.boolean().optional(), documentRequiredAfterDays: z.number().nullish(), isActive: z.boolean().optional() });
export const calendarDocs: Op[] = [
  { method: 'get', path: '/api/holidays', tag: 'Calendar', summary: 'Public holidays of a year', permission: 'leave.read', query: z.object({ year: z.number().optional() }) },
  { method: 'post', path: '/api/holidays', tag: 'Calendar', summary: 'Add a public holiday', permission: 'leave.manage', body: holidayBody, status: 201 },
  { method: 'delete', path: '/api/holidays/:id', tag: 'Calendar', summary: 'Remove a public holiday', permission: 'leave.manage', status: 204 },
  { method: 'get', path: '/api/leave-types', tag: 'Calendar', summary: 'List leave types', permission: 'leave.read' },
  { method: 'post', path: '/api/leave-types', tag: 'Calendar', summary: 'Create a leave type', permission: 'leave.manage', body: leaveTypeDoc, status: 201 },
  { method: 'put', path: '/api/leave-types/:id', tag: 'Calendar', summary: 'Update a leave type', permission: 'leave.manage', body: leaveTypeDoc.partial() },
];
