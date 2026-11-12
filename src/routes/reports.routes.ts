import { Router } from 'express';
import * as c from '../controllers/reports.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import type { Op } from '../utils/openapi.js';
import { attendanceReportQuery, leaveReportQuery, payrollReportQuery } from '../validators/payroll.validator.js';

export function reportRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/headcount', authorize('report.view'), c.headcount);
  r.get('/attendance', authorize('report.view'), validate({ query: attendanceReportQuery }), c.attendance);
  r.get('/leave', authorize('report.view'), validate({ query: leaveReportQuery }), c.leave);
  r.get('/payroll', authorize('report.view'), authorize('payroll.read'), validate({ query: payrollReportQuery }), c.payroll);
  return r;
}

export const reportDocs: Op[] = [
  { method: 'get', path: '/api/reports/headcount', tag: 'Reports', summary: 'Headcount by department, gender, tenure and 12-month movement', permission: 'report.view' },
  { method: 'get', path: '/api/reports/attendance', tag: 'Reports', summary: 'Attendance summary per employee for a month', permission: 'report.view', query: attendanceReportQuery },
  { method: 'get', path: '/api/reports/leave', tag: 'Reports', summary: 'Leave taken and balances for a year', permission: 'report.view', query: leaveReportQuery },
  { method: 'get', path: '/api/reports/payroll', tag: 'Reports', summary: 'Pay runs of a year and cost by department', permission: 'report.view' },
];
