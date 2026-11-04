import { Router } from 'express';
import * as c from '../controllers/allowances.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { allowanceTypeBody, employeeAllowancesBody } from '../validators/allowances.validator.js';

export function allowanceTypeRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('payroll.read'), c.listTypes);
  r.post('/', authorize('settings.manage'), validate({ body: allowanceTypeBody }), c.createType);
  r.put('/:id', authorize('settings.manage'), validate({ params: idParams, body: allowanceTypeBody.partial() }), c.updateType);
  return r;
}

/** Mounted inside the employees router at /:id/allowances. */
export function attachEmployeeAllowances(r: Router) {
  r.get('/:id/allowances', authorize('payroll.read'), validate({ params: idParams }), c.listForEmployee);
  r.put('/:id/allowances', authorize('payroll.manage'), validate({ params: idParams, body: employeeAllowancesBody }), c.replaceForEmployee);
}

export const allowanceDocs: Op[] = [
  { method: 'get', path: '/api/allowance-types', tag: 'Payroll', summary: 'List allowance types', permission: 'payroll.read' },
  { method: 'post', path: '/api/allowance-types', tag: 'Payroll', summary: 'Create an allowance type', permission: 'settings.manage', body: allowanceTypeBody, status: 201 },
  { method: 'put', path: '/api/allowance-types/:id', tag: 'Payroll', summary: 'Update an allowance type', permission: 'settings.manage', body: allowanceTypeBody.partial() },
  { method: 'get', path: '/api/employees/:id/allowances', tag: 'Payroll', summary: "An employee's monthly allowances", permission: 'payroll.read' },
  { method: 'put', path: '/api/employees/:id/allowances', tag: 'Payroll', summary: "Replace an employee's allowances (amount 0 removes)", permission: 'payroll.manage', body: employeeAllowancesBody },
];
