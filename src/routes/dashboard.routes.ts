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
  r.get('/today', authorize('attendance.read'), c.today);
  return r;
}

export const dashboardDocs: Op[] = [
  { method: 'get', path: '/api/dashboard/summary', tag: 'Dashboard', summary: 'Headline numbers in scope', permission: 'dashboard.view' },
  { method: 'get', path: '/api/dashboard/today', tag: 'Dashboard', summary: 'Who has not checked in, who is late and who is on leave today (department or company scope)', permission: 'attendance.read' },
  { method: 'get', path: '/api/dashboard/charts', tag: 'Dashboard', summary: 'Chart series in scope', permission: 'dashboard.view' },
];
