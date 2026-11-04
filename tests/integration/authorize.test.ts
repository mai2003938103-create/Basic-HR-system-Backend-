import express from 'express';
import request from 'supertest';
import { authenticate } from '../../src/middlewares/authenticate.js';
import { authorize } from '../../src/middlewares/authorize.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { audit } from '../../src/utils/audit.js';
import { prisma as db, resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factory.js';
import { auth } from '../helpers/app.js';

function app() {
  const a = express();
  a.get('/t', authenticate, authorize('employee.create'), (_req, res) => res.json({ ok: true }));
  a.use(errorHandler);
  return a;
}

describe('authorize', () => {
  beforeAll(resetDb);

  it('rejects a role without the permission', async () => {
    const { token } = await createUser({ role: 'employee' });
    const res = await request(app()).get('/t').set(auth(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows hr_admin and super_admin', async () => {
    const hr = await createUser({ role: 'hr_admin' });
    const sa = await createUser({ role: 'super_admin', withEmployee: false });
    expect((await request(app()).get('/t').set(auth(hr.token))).status).toBe(200);
    expect((await request(app()).get('/t').set(auth(sa.token))).status).toBe(200);
  });

  it('audit strips secrets from snapshots', async () => {
    const { user } = await createUser({ role: 'hr_admin' });
    const ctx = { userId: user.id, employeeId: null, email: user.email, roles: [], permissions: new Set<string>(), scope: 'all' as const, managedDepartmentIds: [] };
    await audit(db, ctx, { action: 'user.update', entity: 'user', entityId: user.id, before: { email: 'a', passwordHash: 'h' }, after: { email: 'b', tokenHash: 't' } });
    const row = (await db.auditLog.findFirst({ orderBy: { createdAt: 'desc' } }))!;
    expect(row.before).toEqual({ email: 'a' });
    expect(row.after).toEqual({ email: 'b' });
    expect(row.actorUserId).toBe(user.id);
  });
});
