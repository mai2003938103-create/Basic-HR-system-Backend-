import type { Request, Response } from 'express';
import * as payslips from '../services/payslips.service.js';
import * as svc from '../services/payroll/runs.service.js';

export const list = async (req: Request, res: Response) => res.json({ data: await svc.list((req.query as any).year) });
export const create = async (req: Request, res: Response) => res.status(201).json({ data: await svc.create(req.auth!, req.body.period, req.ip) });
export const get = async (req: Request, res: Response) => res.json({ data: await svc.get(req.auth!, req.params.id) });
export const updateItem = async (req: Request, res: Response) => res.json({ data: await svc.updateItem(req.auth!, req.params.id, req.params.employeeId, req.body, req.ip) });
export const recalculate = async (req: Request, res: Response) => res.json({ data: await svc.recalculate(req.auth!, req.params.id, req.ip) });
export const submit = async (req: Request, res: Response) => res.json({ data: await svc.submit(req.auth!, req.params.id, req.ip) });
export const reject = async (req: Request, res: Response) => res.json({ data: await svc.reject(req.auth!, req.params.id, req.body.note, req.ip) });
export const approve = async (req: Request, res: Response) => res.json({ data: await svc.approve(req.auth!, req.params.id, req.ip) });
export const pay = async (req: Request, res: Response) => res.json({ data: await svc.pay(req.auth!, req.params.id, req.ip) });
export const remove = async (req: Request, res: Response) => {
  await svc.remove(req.auth!, req.params.id, req.ip);
  res.status(204).end();
};
export const exportRun = async (req: Request, res: Response) => {
  const { csv, missing, period } = await svc.exportBankCsv(req.params.id, (req.query as any).lang);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payroll-${period}.csv"`);
  res.setHeader('X-Missing-Bank', String(missing));
  res.setHeader('Access-Control-Expose-Headers', 'X-Missing-Bank, Content-Disposition');
  res.send(csv);
};

export const listPayslips = async (req: Request, res: Response) => res.json({ data: await payslips.list(req.auth!, (req.query as any).employeeId) });
export const getPayslip = async (req: Request, res: Response) => res.json({ data: await payslips.get(req.auth!, req.params.runId, req.params.employeeId) });
