import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { publicSettings } from './settings.service.js';

export function settingsRoutes() {
  const r = Router();
  r.get('/public', authenticate, async (_req, res) => res.json({ data: await publicSettings() }));
  return r;
}
