import type { Request, Response } from 'express';
import * as svc from '../services/settings.service.js';

export const publicSettings = async (_req: Request, res: Response) => res.json({ data: await svc.publicSettings() });
export const get = async (_req: Request, res: Response) => res.json({ data: await svc.fullSettings() });
export const saveCompany = async (req: Request, res: Response) => res.json({ data: await svc.saveCompany(req.auth!, req.body) });
export const saveWorkTime = async (req: Request, res: Response) => res.json({ data: await svc.saveWorkTime(req.auth!, req.body) });
export const savePayroll = async (req: Request, res: Response) => res.json({ data: await svc.savePayroll(req.auth!, req.body) });
export const confirmPayroll = async (req: Request, res: Response) => res.json({ data: await svc.confirmPayroll(req.auth!) });
export const preview = async (req: Request, res: Response) => res.json({ data: await svc.preview(req.body.gross) });
