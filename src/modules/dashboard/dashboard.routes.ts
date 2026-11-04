import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import * as svc from './dashboard.service.js';

export function dashboardRoutes() {
  const r = Router();
  r.use(authenticate, authorize('dashboard.view'));
  r.get('/summary', async (req, res) => res.json({ data: await svc.summary(req.auth!) }));
  r.get('/charts', async (req, res) => res.json({ data: await svc.charts(req.auth!) }));
  return r;
}
