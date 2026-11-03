import type { Request, Response } from 'express';
import { badRequest } from '../../lib/errors.js';
import { saveUpload } from '../../lib/upload.js';
import * as svc from './employees.service.js';

export const list = async (req: Request, res: Response) => res.json(await svc.list(req.auth!, req.query as any));
export const get = async (req: Request, res: Response) => res.json({ data: await svc.get(req.auth!, req.params.id) });
export const create = async (req: Request, res: Response) => res.status(201).json({ data: await svc.create(req.auth!, req.body) });
export const update = async (req: Request, res: Response) => res.json({ data: await svc.update(req.auth!, req.params.id, req.body) });
export const remove = async (req: Request, res: Response) => {
  await svc.setStatus(req.auth!, req.params.id, 'inactive');
  res.status(204).end();
};
export const setStatus = async (req: Request, res: Response) => res.json({ data: await svc.setStatus(req.auth!, req.params.id, req.body.status) });
export const uploadPhoto = async (req: Request, res: Response) => {
  if (!req.file) throw badRequest('errors.upload.missing');
  await svc.get(req.auth!, req.params.id);
  const key = await saveUpload(req.file, 'photos');
  res.json({ data: await svc.setPhoto(req.auth!, req.params.id, key) });
};
