import type { Request, Response } from 'express';
import * as svc from '../services/roles.service.js';

export const assignable = async (req: Request, res: Response) => res.json({ data: await svc.assignable(req.auth!) });
export const list = async (_req: Request, res: Response) => res.json({ data: await svc.list() });
export const create = async (req: Request, res: Response) => res.status(201).json({ data: await svc.create(req.auth!, req.body) });
export const update = async (req: Request, res: Response) => res.json({ data: await svc.update(req.auth!, req.params.id, req.body) });
export const listPermissions = async (_req: Request, res: Response) => res.json({ data: await svc.listPermissions() });
