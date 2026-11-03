import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/http.js';
import * as c from './users.controller.js';
import { createUserBody, listUsersQuery, updateUserBody, userStatusBody } from './users.schema.js';

export function userRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('user.read'), validate({ query: listUsersQuery }), c.list);
  r.post('/', authorize('user.manage'), validate({ body: createUserBody }), c.create);
  r.get('/:id', authorize('user.read'), validate({ params: idParams }), c.get);
  r.put('/:id', authorize('user.manage'), validate({ params: idParams, body: updateUserBody }), c.update);
  r.patch('/:id/status', authorize('user.manage'), validate({ params: idParams, body: userStatusBody }), c.setStatus);
  r.post('/:id/reset-link', authorize('user.manage'), validate({ params: idParams }), c.resetLink);
  return r;
}
