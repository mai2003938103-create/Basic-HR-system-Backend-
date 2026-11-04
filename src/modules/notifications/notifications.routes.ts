import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { boolQuery, idParams } from '../../utils/http.js';
import * as svc from './notifications.service.js';

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unread: boolQuery,
});

export function notificationRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', validate({ query }), async (req, res) => res.json(await svc.list(req.auth!.userId, req.query as any)));
  r.put('/read-all', async (req, res) => {
    await svc.markAllRead(req.auth!.userId);
    res.status(204).end();
  });
  r.put('/:id/read', validate({ params: idParams }), async (req, res) => res.json({ data: await svc.markRead(req.auth!.userId, req.params.id) }));
  return r;
}
