import type { Request, Response } from 'express';
import * as svc from '../services/users.service.js';

export const list = async (req: Request, res: Response) => res.json(await svc.list(req.query as any));
export const get = async (req: Request, res: Response) => res.json({ data: await svc.get(req.params.id) });
export const create = async (req: Request, res: Response) => res.status(201).json({ data: await svc.create(req.auth!, req.body) });
export const update = async (req: Request, res: Response) => res.json({ data: await svc.update(req.auth!, req.params.id, req.body) });
export const setStatus = async (req: Request, res: Response) => res.json({ data: await svc.setStatus(req.auth!, req.params.id, req.body.isActive) });
export const resetLink = async (req: Request, res: Response) => res.json({ data: await svc.resetLink(req.auth!, req.params.id) });
