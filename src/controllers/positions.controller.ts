import type { Request, Response } from 'express';
import * as svc from '../services/positions.service.js';

export const list = async (req: Request, res: Response) => res.json(await svc.list(req.query as any));
export const get = async (req: Request, res: Response) => res.json({ data: await svc.get(req.params.id) });
export const create = async (req: Request, res: Response) => res.status(201).json({ data: await svc.create(req.auth!, req.body) });
export const update = async (req: Request, res: Response) => res.json({ data: await svc.update(req.auth!, req.params.id, req.body) });
export const remove = async (req: Request, res: Response) => {
  await svc.remove(req.auth!, req.params.id);
  res.status(204).end();
};
