import { Router } from 'express';
import * as c from '../controllers/departments.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { createDepartmentBody, listDepartmentsQuery, updateDepartmentBody } from '../validators/departments.validator.js';

export function departmentRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('department.read'), validate({ query: listDepartmentsQuery }), c.list);
  r.post('/', authorize('department.manage'), validate({ body: createDepartmentBody }), c.create);
  r.get('/:id', authorize('department.read'), validate({ params: idParams }), c.get);
  r.put('/:id', authorize('department.manage'), validate({ params: idParams, body: updateDepartmentBody }), c.update);
  r.delete('/:id', authorize('department.manage'), validate({ params: idParams }), c.remove);
  return r;
}

export const departmentDocs: Op[] = [
  { method: 'get', path: '/api/departments', tag: 'Departments', summary: 'List departments', permission: 'department.read', query: listDepartmentsQuery },
  { method: 'post', path: '/api/departments', tag: 'Departments', summary: 'Create a department', permission: 'department.manage', body: createDepartmentBody, status: 201 },
  { method: 'get', path: '/api/departments/:id', tag: 'Departments', summary: 'Department detail', permission: 'department.read' },
  { method: 'put', path: '/api/departments/:id', tag: 'Departments', summary: 'Update a department', permission: 'department.manage', body: updateDepartmentBody },
  { method: 'delete', path: '/api/departments/:id', tag: 'Departments', summary: 'Delete an unused department', permission: 'department.manage', status: 204 },
];
