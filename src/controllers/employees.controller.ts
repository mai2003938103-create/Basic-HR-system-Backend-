import type { Request, Response } from 'express';
import { badRequest, notFound } from '../utils/errors.js';
import { saveUpload } from '../utils/upload.js';
import * as svc from '../services/employees.service.js';

export const list = async (req: Request, res: Response) => res.json(await svc.list(req.auth!, req.query as any));
export const me = async (req: Request, res: Response) => {
  if (!req.auth!.employeeId) throw notFound();
  res.json({ data: await svc.get(req.auth!, req.auth!.employeeId) });
};
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
export const uploadOwnPhoto = async (req: Request, res: Response) => {
  if (!req.auth!.employeeId) throw notFound();
  if (!req.file) throw badRequest('errors.upload.missing');
  const key = await saveUpload(req.file, 'photos');
  res.json({ data: await svc.setOwnPhoto(req.auth!, req.auth!.employeeId, key) });
};
export const removeOwnPhoto = async (req: Request, res: Response) => {
  if (!req.auth!.employeeId) throw notFound();
  res.json({ data: await svc.setOwnPhoto(req.auth!, req.auth!.employeeId, null) });
};
