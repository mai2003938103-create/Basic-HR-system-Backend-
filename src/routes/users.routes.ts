import { Router } from 'express';
import * as c from '../controllers/users.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { createUserBody, listUsersQuery, updateUserBody, userStatusBody } from '../validators/users.validator.js';

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

export const userDocs: Op[] = [
  { method: 'get', path: '/api/users', tag: 'Users', summary: 'List users', permission: 'user.read', query: listUsersQuery },
  { method: 'post', path: '/api/users', tag: 'Users', summary: 'Create a user', permission: 'user.manage', body: createUserBody, status: 201 },
  { method: 'get', path: '/api/users/:id', tag: 'Users', summary: 'User detail', permission: 'user.read' },
  { method: 'put', path: '/api/users/:id', tag: 'Users', summary: 'Update email, roles or linked employee', permission: 'user.manage', body: updateUserBody },
  { method: 'patch', path: '/api/users/:id/status', tag: 'Users', summary: 'Activate or deactivate a user', permission: 'user.manage', body: userStatusBody },
  { method: 'post', path: '/api/users/:id/reset-link', tag: 'Users', summary: 'Create a one-time password reset link (1 hour)', permission: 'user.manage' },
];
