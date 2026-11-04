import { Router } from 'express';
import { z } from 'zod';
import { code, idParams, requiredText } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as svc from './allowances.service.js';

export const allowanceTypeBody = z.object({ code, nameLo: requiredText(), nameEn: requiredText(), taxable: z.boolean().optional(), isActive: z.boolean().optional() });
export const employeeAllowancesBody = z.object({
  items: z.array(z.object({ typeId: z.string().uuid('errors.common.notFound'), amount: z.number().int('errors.validation.money').min(0, 'errors.validation.money').max(1e12) })).max(50),
});

export function allowanceTypeRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('payroll.read'), async (_req, res) => res.json({ data: await svc.listTypes() }));
  r.post('/', authorize('settings.manage'), validate({ body: allowanceTypeBody }), async (req, res) => res.status(201).json({ data: await svc.createType(req.auth!, req.body) }));
  r.put('/:id', authorize('settings.manage'), validate({ params: idParams, body: allowanceTypeBody.partial() }), async (req, res) => res.json({ data: await svc.updateType(req.auth!, req.params.id, req.body) }));
  return r;
}

/** Mounted inside the employees router at /:id/allowances. */
export function attachEmployeeAllowances(r: Router) {
  r.get('/:id/allowances', authorize('payroll.read'), validate({ params: idParams }), async (req, res) => res.json({ data: await svc.listForEmployee(req.auth!, req.params.id) }));
  r.put('/:id/allowances', authorize('payroll.manage'), validate({ params: idParams, body: employeeAllowancesBody }), async (req, res) =>
    res.json({ data: await svc.replaceForEmployee(req.auth!, req.params.id, req.body.items) }),
  );
}
