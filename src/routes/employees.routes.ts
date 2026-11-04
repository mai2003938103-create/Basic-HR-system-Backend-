import { Router } from 'express';
import * as c from '../controllers/employees.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { imageUpload } from '../utils/upload.js';
import { createEmployeeBody, listEmployeesQuery, statusBody, updateEmployeeBody } from '../validators/employees.validator.js';

export function employeeRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('employee.read'), validate({ query: listEmployeesQuery }), c.list);
  r.get('/me', c.me);
  r.post('/', authorize('employee.create'), validate({ body: createEmployeeBody }), c.create);
  r.get('/:id', authorize('employee.read'), validate({ params: idParams }), c.get);
  r.put('/:id', authorize('employee.update'), validate({ params: idParams, body: updateEmployeeBody }), c.update);
  r.delete('/:id', authorize('employee.delete'), validate({ params: idParams }), c.remove);
  r.patch('/:id/status', authorize('employee.update'), validate({ params: idParams, body: statusBody }), c.setStatus);
  r.post('/:id/photo', authorize('employee.update'), validate({ params: idParams }), imageUpload.single('photo'), c.uploadPhoto);
  return r;
}

export const employeeDocs: Op[] = [
  { method: 'get', path: '/api/employees', tag: 'Employees', summary: 'List employees in scope', permission: 'employee.read', query: listEmployeesQuery },
  { method: 'post', path: '/api/employees', tag: 'Employees', summary: 'Create an employee (optionally with a login account)', permission: 'employee.create', body: createEmployeeBody, status: 201 },
  { method: 'get', path: '/api/employees/me', tag: 'Employees', summary: "Caller's own employee record" },
  { method: 'get', path: '/api/employees/:id', tag: 'Employees', summary: 'Employee detail', permission: 'employee.read' },
  { method: 'put', path: '/api/employees/:id', tag: 'Employees', summary: 'Update an employee', permission: 'employee.update', body: updateEmployeeBody },
  { method: 'delete', path: '/api/employees/:id', tag: 'Employees', summary: 'Deactivate an employee (soft delete)', permission: 'employee.delete', status: 204 },
  { method: 'patch', path: '/api/employees/:id/status', tag: 'Employees', summary: 'Change employment status', permission: 'employee.update', body: statusBody },
  { method: 'post', path: '/api/employees/:id/photo', tag: 'Employees', summary: 'Upload a profile photo', permission: 'employee.update', multipart: { photo: 'binary' } },
];
