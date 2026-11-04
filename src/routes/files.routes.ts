import { Router } from 'express';
import * as c from '../controllers/files.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import type { Op } from '../utils/openapi.js';

export function fileRoutes() {
  const r = Router();
  r.get('/:folder/:name', authenticate, c.download);
  return r;
}

export const fileDocs: Op[] = [{ method: 'get', path: '/api/files/:folder/:name', tag: 'Files', summary: 'Download an uploaded photo or (authorized) document' }];
