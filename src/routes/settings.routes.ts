import { Router } from 'express';
import * as c from '../controllers/settings.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import type { Op } from '../utils/openapi.js';
import { companyBody, payrollBody, previewBody, workTimeBody } from '../validators/settings.validator.js';

export function settingsRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/public', c.publicSettings);
  r.get('/', authorize('settings.manage'), c.get);
  r.put('/company', authorize('settings.manage'), validate({ body: companyBody }), c.saveCompany);
  r.put('/work-time', authorize('settings.manage'), validate({ body: workTimeBody }), c.saveWorkTime);
  r.put('/payroll', authorize('settings.manage'), validate({ body: payrollBody }), c.savePayroll);
  r.post('/payroll/confirm', authorize('settings.manage'), c.confirmPayroll);
  r.post('/payroll/preview', authorize('settings.manage'), validate({ body: previewBody }), c.preview);
  return r;
}

export const settingsDocs: Op[] = [
  { method: 'get', path: '/api/settings/public', tag: 'Settings', summary: 'Company name, currency and working hours' },
  { method: 'get', path: '/api/settings', tag: 'Settings', summary: 'All company settings including payroll rules', permission: 'settings.manage' },
  { method: 'put', path: '/api/settings/company', tag: 'Settings', summary: 'Company name, address, tax ID and currency', permission: 'settings.manage', body: companyBody },
  { method: 'put', path: '/api/settings/work-time', tag: 'Settings', summary: 'Working days and hours', permission: 'settings.manage', body: workTimeBody },
  { method: 'put', path: '/api/settings/payroll', tag: 'Settings', summary: 'Payroll rules (saving clears the confirmation)', permission: 'settings.manage', body: payrollBody },
  { method: 'post', path: '/api/settings/payroll/preview', tag: 'Settings', summary: 'Calculate one salary with the current rules', permission: 'settings.manage', body: previewBody },
  { method: 'post', path: '/api/settings/payroll/confirm', tag: 'Settings', summary: 'Mark the payroll rules as confirmed by the company', permission: 'settings.manage' },
];
