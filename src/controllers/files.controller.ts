import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { notFound } from '../utils/errors.js';
import { MIME_BY_EXT, canReadDocument, uploadRoot } from '../utils/upload.js';

const KEY = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

export async function download(req: Request, res: Response) {
  const { folder, name } = req.params;
  if ((folder !== 'photos' && folder !== 'documents') || !KEY.test(name)) throw notFound();
  const key = `${folder}/${name}`;
  if (folder === 'documents' && !(await canReadDocument(req.auth!, key))) throw notFound();
  const file = path.join(uploadRoot(), folder, name);
  if (!fs.existsSync(file)) throw notFound();
  res.setHeader('Content-Type', MIME_BY_EXT[name.split('.').pop()!]);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(file).pipe(res);
}
