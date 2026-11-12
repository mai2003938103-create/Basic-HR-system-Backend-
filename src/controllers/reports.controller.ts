import type { Request, Response } from 'express';
import * as svc from '../services/reports.service.js';

export const headcount = async (req: Request, res: Response) => res.json({ data: await svc.headcount(req.auth!) });
export const attendance = async (req: Request, res: Response) => res.json({ data: await svc.attendance(req.auth!, req.query as any) });
export const leave = async (req: Request, res: Response) => res.json({ data: await svc.leave(req.auth!, req.query as any) });
export const payroll = async (req: Request, res: Response) => res.json({ data: await svc.payroll(req.query as any) });
