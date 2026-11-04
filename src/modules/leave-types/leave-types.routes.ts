import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';
import { audit } from '../../utils/audit.js';
import { notFound } from '../../utils/errors.js';
import { code, idParams, requiredText } from '../../utils/http.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';

const body = z.object({
  code,
  nameLo: requiredText(),
  nameEn: requiredText(),
  defaultDaysPerYear: z.coerce.number().min(0).max(366).transform(String),
  isPaid: z.boolean().optional(),
  documentRequiredAfterDays: z.number().int().min(0).max(366).nullish(),
  isActive: z.boolean().optional(),
});

export const leaveTypeDto = (t: typeof s.leaveTypes.$inferSelect) => ({
  id: t.id,
  code: t.code,
  nameLo: t.nameLo,
  nameEn: t.nameEn,
  defaultDaysPerYear: Number(t.defaultDaysPerYear),
  isPaid: t.isPaid,
  documentRequiredAfterDays: t.documentRequiredAfterDays,
  isActive: t.isActive,
});

export function leaveTypeRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('leave.read'), async (_req, res) => {
    res.json({ data: (await db.select().from(s.leaveTypes).orderBy(asc(s.leaveTypes.code))).map(leaveTypeDto) });
  });
  r.post('/', authorize('leave.manage'), validate({ body }), async (req, res) => {
    const [t] = await db.insert(s.leaveTypes).values(req.body).returning();
    await audit(db, req.auth!, { action: 'leaveType.create', entity: 'leave_type', entityId: t.id, after: t });
    res.status(201).json({ data: leaveTypeDto(t) });
  });
  r.put('/:id', authorize('leave.manage'), validate({ params: idParams, body: body.partial() }), async (req, res) => {
    const [t] = await db.update(s.leaveTypes).set(req.body).where(eq(s.leaveTypes.id, req.params.id)).returning();
    if (!t) throw notFound();
    await audit(db, req.auth!, { action: 'leaveType.update', entity: 'leave_type', entityId: t.id, after: t });
    res.json({ data: leaveTypeDto(t) });
  });
  return r;
}
