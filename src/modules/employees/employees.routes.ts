import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/http.js';
import { imageUpload } from '../../lib/upload.js';
import * as c from './employees.controller.js';
import { createEmployeeBody, listEmployeesQuery, statusBody, updateEmployeeBody } from './employees.schema.js';

export function employeeRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('employee.read'), validate({ query: listEmployeesQuery }), c.list);
  r.post('/', authorize('employee.create'), validate({ body: createEmployeeBody }), c.create);
  r.get('/:id', authorize('employee.read'), validate({ params: idParams }), c.get);
  r.put('/:id', authorize('employee.update'), validate({ params: idParams, body: updateEmployeeBody }), c.update);
  r.delete('/:id', authorize('employee.delete'), validate({ params: idParams }), c.remove);
  r.patch('/:id/status', authorize('employee.update'), validate({ params: idParams, body: statusBody }), c.setStatus);
  r.post('/:id/photo', authorize('employee.update'), validate({ params: idParams }), imageUpload.single('photo'), c.uploadPhoto);
  return r;
}
