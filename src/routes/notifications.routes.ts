import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/notifications.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { listNotificationsQuery } from '../validators/notifications.validator.js';

export function notificationRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', validate({ query: listNotificationsQuery }), c.list);
  r.put('/read-all', c.markAllRead);
  r.put('/:id/read', validate({ params: idParams }), c.markRead);
  return r;
}

export const notificationDocs: Op[] = [
  { method: 'get', path: '/api/notifications', tag: 'Notifications', summary: 'My notifications', query: z.object({ unread: z.enum(['true', 'false']).optional() }) },
  { method: 'put', path: '/api/notifications/read-all', tag: 'Notifications', summary: 'Mark all as read', status: 204 },
  { method: 'put', path: '/api/notifications/:id/read', tag: 'Notifications', summary: 'Mark one as read' },
];
