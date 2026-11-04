import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/http.js';
import { documentUpload, registerDocumentAccess, saveUpload } from '../../utils/upload.js';
import * as svc from './leave.service.js';
import { approveBody, balanceUpdateBody, balancesQuery, createLeaveBody, listLeaveQuery, rejectBody } from './leave.schema.js';

registerDocumentAccess(svc.canReadLeaveDocument);

export function leaveRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('leave.read'), validate({ query: listLeaveQuery }), async (req, res) => res.json(await svc.list(req.auth!, req.query as any)));
  r.post('/', authorize('leave.request'), documentUpload.single('document'), validate({ body: createLeaveBody }), async (req, res) => {
    const key = req.file ? await saveUpload(req.file, 'documents') : null;
    res.status(201).json({ data: await svc.create(req.auth!, req.body, key ? `/api/files/${key}` : null) });
  });
  r.get('/:id', authorize('leave.read'), validate({ params: idParams }), async (req, res) => res.json({ data: await svc.get(req.auth!, req.params.id) }));
  r.put('/:id/approve', authorize('leave.approve'), validate({ params: idParams, body: approveBody }), async (req, res) =>
    res.json({ data: await svc.approve(req.auth!, req.params.id, req.body.note) }),
  );
  r.put('/:id/reject', authorize('leave.approve'), validate({ params: idParams, body: rejectBody }), async (req, res) =>
    res.json({ data: await svc.reject(req.auth!, req.params.id, req.body.note) }),
  );
  r.put('/:id/cancel', authorize('leave.read'), validate({ params: idParams }), async (req, res) => res.json({ data: await svc.cancel(req.auth!, req.params.id) }));
  return r;
}

export function leaveBalanceRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('leave.read'), validate({ query: balancesQuery }), async (req, res) => res.json({ data: await svc.balances(req.auth!, req.query as any) }));
  r.put('/:id', authorize('leave.manage'), validate({ params: idParams, body: balanceUpdateBody }), async (req, res) =>
    res.json({ data: await svc.updateBalance(req.auth!, req.params.id, req.body.entitledDays) }),
  );
  return r;
}
