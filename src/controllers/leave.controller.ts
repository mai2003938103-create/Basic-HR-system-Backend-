import type { Request, Response } from 'express';
import * as svc from '../services/leave.service.js';
import { saveUpload } from '../utils/upload.js';

export const list = async (req: Request, res: Response) => res.json(await svc.list(req.auth!, req.query as any));
export const create = async (req: Request, res: Response) => {
  const key = req.file ? await saveUpload(req.file, 'documents') : null;
  res.status(201).json({ data: await svc.create(req.auth!, req.body, key ? `/api/files/${key}` : null) });
};
export const get = async (req: Request, res: Response) => res.json({ data: await svc.get(req.auth!, req.params.id) });
export const approve = async (req: Request, res: Response) => res.json({ data: await svc.approve(req.auth!, req.params.id, req.body.note) });
export const reject = async (req: Request, res: Response) => res.json({ data: await svc.reject(req.auth!, req.params.id, req.body.note) });
export const cancel = async (req: Request, res: Response) => res.json({ data: await svc.cancel(req.auth!, req.params.id) });
export const balances = async (req: Request, res: Response) => res.json({ data: await svc.balances(req.auth!, req.query as any) });
export const updateBalance = async (req: Request, res: Response) => res.json({ data: await svc.updateBalance(req.auth!, req.params.id, req.body.entitledDays) });
