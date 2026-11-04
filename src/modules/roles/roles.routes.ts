import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/http.js';
import * as svc from './roles.service.js';

export function roleRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/assignable', authorize('user.manage'), async (req, res) => res.json({ data: await svc.assignable(req.auth!) }));
  r.use(authorize('role.manage'));
  r.get('/', async (_req, res) => res.json({ data: await svc.list() }));
  r.post('/', validate({ body: svc.roleBody }), async (req, res) => res.status(201).json({ data: await svc.create(req.auth!, req.body) }));
  r.put('/:id', validate({ params: idParams, body: svc.roleUpdateBody }), async (req, res) =>
    res.json({ data: await svc.update(req.auth!, req.params.id, req.body) }),
  );
  return r;
}

export function permissionRoutes() {
  const r = Router();
  r.get('/', authenticate, authorize('role.manage'), async (_req, res) => res.json({ data: await svc.listPermissions() }));
  return r;
}
