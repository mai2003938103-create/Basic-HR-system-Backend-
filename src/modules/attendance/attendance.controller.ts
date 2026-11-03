import type { Request, Response } from 'express';
import * as svc from './attendance.service.js';

export const today = async (req: Request, res: Response) => res.json({ data: await svc.today(req.auth!) });
export const checkIn = async (req: Request, res: Response) => res.status(201).json({ data: await svc.checkIn(req.auth!, req.ip) });
export const checkOut = async (req: Request, res: Response) => res.json({ data: await svc.checkOut(req.auth!) });
export const list = async (req: Request, res: Response) => res.json(await svc.list(req.auth!, req.query as any));
export const edit = async (req: Request, res: Response) => res.json({ data: await svc.edit(req.auth!, req.params.id, req.body) });
export const exportCsv = async (req: Request, res: Response) => {
  const csv = await svc.exportCsv(req.auth!, req.query as any);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
  res.send(csv);
};
