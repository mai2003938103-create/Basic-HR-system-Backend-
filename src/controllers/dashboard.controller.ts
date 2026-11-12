import type { Request, Response } from 'express';
import * as svc from '../services/dashboard.service.js';

export const summary = async (req: Request, res: Response) => res.json({ data: await svc.summary(req.auth!) });
export const today = async (req: Request, res: Response) => res.json({ data: await svc.today(req.auth!) });
export const charts = async (req: Request, res: Response) => res.json({ data: await svc.charts(req.auth!) });
