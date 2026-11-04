import { Router } from 'express';
import * as c from '../controllers/roles.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { roleBody, roleUpdateBody } from '../validators/roles.validator.js';

export function roleRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/assignable', authorize('user.manage'), c.assignable);
  r.use(authorize('role.manage'));
  r.get('/', c.list);
  r.post('/', validate({ body: roleBody }), c.create);
  r.put('/:id', validate({ params: idParams, body: roleUpdateBody }), c.update);
  return r;
}

export function permissionRoutes() {
  const r = Router();
  r.get('/', authenticate, authorize('role.manage'), c.listPermissions);
  return r;
}

export const roleDocs: Op[] = [
  { method: 'get', path: '/api/roles/assignable', tag: 'Roles', summary: 'Roles the caller may grant to users', permission: 'user.manage' },
  { method: 'get', path: '/api/roles', tag: 'Roles', summary: 'List roles with permissions', permission: 'role.manage' },
  { method: 'post', path: '/api/roles', tag: 'Roles', summary: 'Create a role', permission: 'role.manage', body: roleBody, status: 201 },
  { method: 'put', path: '/api/roles/:id', tag: 'Roles', summary: 'Update a role (super_admin is locked)', permission: 'role.manage', body: roleUpdateBody },
  { method: 'get', path: '/api/permissions', tag: 'Roles', summary: 'List all permissions', permission: 'role.manage' },
];
