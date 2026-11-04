import type { Request, Response } from 'express';
import * as svc from '../services/allowances.service.js';

export const listTypes = async (_req: Request, res: Response) => res.json({ data: await svc.listTypes() });
export const createType = async (req: Request, res: Response) => res.status(201).json({ data: await svc.createType(req.auth!, req.body) });
export const updateType = async (req: Request, res: Response) => res.json({ data: await svc.updateType(req.auth!, req.params.id, req.body) });
export const listForEmployee = async (req: Request, res: Response) => res.json({ data: await svc.listForEmployee(req.auth!, req.params.id) });
export const replaceForEmployee = async (req: Request, res: Response) => res.json({ data: await svc.replaceForEmployee(req.auth!, req.params.id, req.body.items) });
