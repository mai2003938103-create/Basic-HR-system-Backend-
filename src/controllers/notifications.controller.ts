import type { Request, Response } from 'express';
import * as svc from '../services/notifications.service.js';

export const list = async (req: Request, res: Response) => res.json(await svc.list(req.auth!.userId, req.query as any));
export const markAllRead = async (req: Request, res: Response) => {
  await svc.markAllRead(req.auth!.userId);
  res.status(204).end();
};
export const markRead = async (req: Request, res: Response) => res.json({ data: await svc.markRead(req.auth!.userId, req.params.id) });
