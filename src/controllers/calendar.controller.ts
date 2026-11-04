import type { Request, Response } from 'express';
import * as svc from '../services/calendar.service.js';

export const listHolidays = async (req: Request, res: Response) =>
  res.json({ data: await svc.listHolidays((req.query as { year?: number }).year ?? new Date().getFullYear()) });
export const addHoliday = async (req: Request, res: Response) => res.status(201).json({ data: await svc.addHoliday(req.auth!, req.body) });
export const removeHoliday = async (req: Request, res: Response) => {
  await svc.removeHoliday(req.auth!, req.params.id);
  res.status(204).end();
};
export const listLeaveTypes = async (_req: Request, res: Response) => res.json({ data: await svc.listLeaveTypes() });
export const createLeaveType = async (req: Request, res: Response) => res.status(201).json({ data: await svc.createLeaveType(req.auth!, req.body) });
export const updateLeaveType = async (req: Request, res: Response) => res.json({ data: await svc.updateLeaveType(req.auth!, req.params.id, req.body) });
