import { Router } from 'express';
import * as c from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import type { Op } from '../utils/openapi.js';

export function dashboardRoutes() {
  const r = Router();
  r.use(authenticate, authorize('dashboard.view'));
  r.get('/summary', c.summary);
  r.get('/charts', c.charts);
  return r;
}

export const dashboardDocs: Op[] = [
  { method: 'get', path: '/api/dashboard/summary', tag: 'Dashboard', summary: 'Headline numbers in scope', permission: 'dashboard.view' },
  { method: 'get', path: '/api/dashboard/charts', tag: 'Dashboard', summary: 'Chart series in scope', permission: 'dashboard.view' },
];
