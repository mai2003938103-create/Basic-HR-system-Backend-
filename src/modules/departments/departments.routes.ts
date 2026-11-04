import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/http.js';
import * as c from './departments.controller.js';
import { createDepartmentBody, listDepartmentsQuery, updateDepartmentBody } from './departments.schema.js';

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
