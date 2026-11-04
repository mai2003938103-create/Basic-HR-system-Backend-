import { Router } from 'express';
import * as c from '../controllers/positions.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { createPositionBody, listPositionsQuery, updatePositionBody } from '../validators/positions.validator.js';

export function positionRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('position.read'), validate({ query: listPositionsQuery }), c.list);
  r.post('/', authorize('position.manage'), validate({ body: createPositionBody }), c.create);
  r.get('/:id', authorize('position.read'), validate({ params: idParams }), c.get);
  r.put('/:id', authorize('position.manage'), validate({ params: idParams, body: updatePositionBody }), c.update);
  r.delete('/:id', authorize('position.manage'), validate({ params: idParams }), c.remove);
  return r;
}

export const positionDocs: Op[] = [
  { method: 'get', path: '/api/positions', tag: 'Positions', summary: 'List positions', permission: 'position.read', query: listPositionsQuery },
  { method: 'post', path: '/api/positions', tag: 'Positions', summary: 'Create a position', permission: 'position.manage', body: createPositionBody, status: 201 },
  { method: 'get', path: '/api/positions/:id', tag: 'Positions', summary: 'Position detail', permission: 'position.read' },
  { method: 'put', path: '/api/positions/:id', tag: 'Positions', summary: 'Update a position', permission: 'position.manage', body: updatePositionBody },
  { method: 'delete', path: '/api/positions/:id', tag: 'Positions', summary: 'Delete an unused position', permission: 'position.manage', status: 204 },
];
