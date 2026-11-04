import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/http.js';
import * as c from './positions.controller.js';
import { createPositionBody, listPositionsQuery, updatePositionBody } from './positions.schema.js';

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
