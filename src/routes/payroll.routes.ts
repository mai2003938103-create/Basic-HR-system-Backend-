import { Router } from 'express';
import * as c from '../controllers/payroll.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { createRunBody, exportRunQuery, itemBody, listRunsQuery, payslipListQuery, payslipParams, returnBody, runItemParams } from '../validators/payroll.validator.js';

export function payrollRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/runs', authorize('payroll.read'), validate({ query: listRunsQuery }), c.list);
  r.post('/runs', authorize('payroll.manage'), validate({ body: createRunBody }), c.create);
  r.get('/runs/:id', authorize('payroll.read'), validate({ params: idParams }), c.get);
  r.delete('/runs/:id', authorize('payroll.manage'), validate({ params: idParams }), c.remove);
  r.put('/runs/:id/items/:employeeId', authorize('payroll.manage'), validate({ params: runItemParams, body: itemBody }), c.updateItem);
  r.post('/runs/:id/recalculate', authorize('payroll.manage'), validate({ params: idParams }), c.recalculate);
  r.put('/runs/:id/submit', authorize('payroll.manage'), validate({ params: idParams }), c.submit);
  r.put('/runs/:id/reject', authorize('payroll.approve'), validate({ params: idParams, body: returnBody }), c.reject);
  r.put('/runs/:id/return', authorize('payroll.approve'), validate({ params: idParams, body: returnBody }), c.reject);
  r.put('/runs/:id/approve', authorize('payroll.approve'), validate({ params: idParams }), c.approve);
  r.put('/runs/:id/pay', authorize('payroll.manage'), validate({ params: idParams }), c.pay);
  r.get('/runs/:id/export', authorize('payroll.manage'), validate({ params: idParams, query: exportRunQuery }), c.exportRun);
  return r;
}

/** Payslips need no blanket permission: the service lets payroll.read see anyone and payslip.self see their own. */
export function payslipRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', validate({ query: payslipListQuery }), c.listPayslips);
  r.get('/:runId/:employeeId', validate({ params: payslipParams }), c.getPayslip);
  return r;
}

export const payrollDocs: Op[] = [
  { method: 'get', path: '/api/payroll/runs', tag: 'Payroll', summary: 'List pay runs', permission: 'payroll.read', query: listRunsQuery },
  { method: 'post', path: '/api/payroll/runs', tag: 'Payroll', summary: 'Create a draft pay run for a month', permission: 'payroll.manage', body: createRunBody, status: 201 },
  { method: 'get', path: '/api/payroll/runs/:id', tag: 'Payroll', summary: 'Pay run with lines and comparison to the previous run', permission: 'payroll.read' },
  { method: 'delete', path: '/api/payroll/runs/:id', tag: 'Payroll', summary: 'Delete a draft pay run', permission: 'payroll.manage', status: 204 },
  { method: 'put', path: '/api/payroll/runs/:id/items/:employeeId', tag: 'Payroll', summary: "Adjust one employee's line (draft only)", permission: 'payroll.manage', body: itemBody },
  { method: 'post', path: '/api/payroll/runs/:id/recalculate', tag: 'Payroll', summary: 'Recalculate a draft from attendance and leave, keeping manual edits', permission: 'payroll.manage' },
  { method: 'put', path: '/api/payroll/runs/:id/submit', tag: 'Payroll', summary: 'Submit for approval (snapshots the rules)', permission: 'payroll.manage' },
  { method: 'put', path: '/api/payroll/runs/:id/reject', tag: 'Payroll', summary: 'Return to draft with a reason', permission: 'payroll.approve', body: returnBody },
  { method: 'put', path: '/api/payroll/runs/:id/return', tag: 'Payroll', summary: 'Alias of reject', permission: 'payroll.approve', body: returnBody },
  { method: 'put', path: '/api/payroll/runs/:id/approve', tag: 'Payroll', summary: 'Approve (not by the submitter)', permission: 'payroll.approve' },
  { method: 'put', path: '/api/payroll/runs/:id/pay', tag: 'Payroll', summary: 'Mark as paid and notify employees', permission: 'payroll.manage' },
  { method: 'get', path: '/api/payroll/runs/:id/export', tag: 'Payroll', summary: 'Bank transfer file (CSV); X-Missing-Bank counts rows without an account', permission: 'payroll.manage', query: exportRunQuery },
  { method: 'get', path: '/api/payslips', tag: 'Payroll', summary: 'Payslips of the caller (paid runs) or, with payroll.read, of any employee', query: payslipListQuery },
  { method: 'get', path: '/api/payslips/:runId/:employeeId', tag: 'Payroll', summary: 'One payslip with company details and the rules used' },
];
