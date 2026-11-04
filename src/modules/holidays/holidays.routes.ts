import { Router } from 'express';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';
import { audit } from '../../utils/audit.js';
import { notFound } from '../../utils/errors.js';
import { idParams, requiredText } from '../../utils/http.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';

const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'errors.validation.date'), nameLo: requiredText(), nameEn: requiredText() });
const query = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

export function holidayRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('leave.read'), validate({ query }), async (req, res) => {
    const year = (req.query as z.infer<typeof query>).year ?? new Date().getFullYear();
    const rows = await db.select().from(s.holidays).where(and(gte(s.holidays.date, `${year}-01-01`), lte(s.holidays.date, `${year}-12-31`))).orderBy(asc(s.holidays.date));
    res.json({ data: rows });
  });
  r.post('/', authorize('leave.manage'), validate({ body }), async (req, res) => {
    const [h] = await db.insert(s.holidays).values(req.body).returning();
    await audit(db, req.auth!, { action: 'holiday.create', entity: 'holiday', entityId: h.id, after: h });
    res.status(201).json({ data: h });
  });
  r.delete('/:id', authorize('leave.manage'), validate({ params: idParams }), async (req, res) => {
    const [h] = await db.delete(s.holidays).where(eq(s.holidays.id, req.params.id)).returning();
    if (!h) throw notFound();
    await audit(db, req.auth!, { action: 'holiday.delete', entity: 'holiday', entityId: h.id, before: h });
    res.status(204).end();
  });
  return r;
}
