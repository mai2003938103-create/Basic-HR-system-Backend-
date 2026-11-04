import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as s from '../../db/schema.js';
import { audit } from '../../utils/audit.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { calculatePayItem } from '../payroll/calc.js';
import { getPayrollConfig } from '../payroll/config.js';
import { fullSettings, invalidateSettings, publicSettings } from './settings.service.js';
import { companyBody, payrollBody, previewBody, workTimeBody } from './settings.schema.js';

export function settingsRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/public', async (_req, res) => res.json({ data: await publicSettings() }));
  r.get('/', authorize('settings.manage'), async (_req, res) => res.json({ data: await fullSettings() }));

  const save = (action: string, toRow: (body: any, before: Awaited<ReturnType<typeof fullSettings>>, userId: string) => Partial<typeof s.companySettings.$inferInsert>) =>
    async (req: any, res: any) => {
      const before = await fullSettings();
      await db.transaction(async (tx) => {
        await tx.update(s.companySettings).set(toRow(req.body, before, req.auth.userId)).where(eq(s.companySettings.id, 1));
        invalidateSettings();
        await audit(tx, req.auth, { action, entity: 'company_settings', entityId: '1', before, after: req.body });
      });
      invalidateSettings();
      res.json({ data: await fullSettings() });
    };

  r.put('/company', authorize('settings.manage'), validate({ body: companyBody }), save('settings.company', (b) => b));
  r.put('/work-time', authorize('settings.manage'), validate({ body: workTimeBody }), save('settings.workTime', (b) => b));
  // Any change to the rules makes them unconfirmed again.
  r.put('/payroll', authorize('settings.manage'), validate({ body: payrollBody }), save('settings.payroll', (b) => ({ payrollConfig: { ...b, confirmedBy: null, confirmedAt: null } })));
  r.post('/payroll/confirm', authorize('settings.manage'), save('settings.payrollConfirm', (_b, before, userId) => ({ payrollConfig: { ...before.payroll, confirmedBy: userId, confirmedAt: new Date().toISOString() } })));
  r.post('/payroll/preview', authorize('settings.manage'), validate({ body: previewBody }), async (req, res) => {
    const cfg = await getPayrollConfig();
    const result = calculatePayItem(
      { basic: req.body.gross, periodWorkDays: cfg.workDaysPerMonth, paidWorkDays: cfg.workDaysPerMonth, allowances: [], overtimeMinutesWeekday: 0, overtimeMinutesRestday: 0, bonus: 0, otherDeduction: 0, unpaidDays: 0 },
      cfg,
    );
    res.json({ data: result });
  });
  return r;
}
