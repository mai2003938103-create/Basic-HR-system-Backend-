import type { Request, Response } from 'express';
import * as svc from '../services/settings.service.js';

export const publicSettings = async (_req: Request, res: Response) => res.json({ data: await svc.publicSettings() });
