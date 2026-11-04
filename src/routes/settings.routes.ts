import { Router } from 'express';
import * as c from '../controllers/settings.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import type { Op } from '../utils/openapi.js';

export function settingsRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/public', c.publicSettings);
  return r;
}

export const settingsDocs: Op[] = [{ method: 'get', path: '/api/settings/public', tag: 'Settings', summary: 'Company name, currency and working hours' }];
