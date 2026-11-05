import { prisma as db, resetDb } from '../helpers/db.js';
import { createEmployee, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

describe('users', () => {
  let hr: Awaited<ReturnType<typeof createUser>>;
  beforeEach(async () => {
    await resetDb();
    hr = await createUser({ role: 'hr_admin' });
  });

  it('creates a user linked to an employee and assigns manager', async () => {
    const e = await createEmployee();
    const res = await testApp().post('/api/users').set(auth(hr.token)).send({ email: 'boss@test.la', password: 'Start1234', roleCodes: ['manager'], employeeId: e.id });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'boss@test.la', roles: ['manager'], isActive: true });
    expect(res.body.data.employee.id).toBe(e.id);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it('lists and searches users', async () => {
    await createUser({ role: 'employee', employee: { email: 'findme@test.la' } });
    const res = await testApp().get('/api/users?search=findme').set(auth(hr.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: any) => u.email)).toEqual(['findme@test.la']);
  });

  it('does not let hr_admin grant super_admin', async () => {
    const res = await testApp().post('/api/users').set(auth(hr.token)).send({ email: 'x@test.la', password: 'Start1234', roleCodes: ['super_admin'] });
    expect(res.status).toBe(403);
  });

  it('prevents deactivating yourself', async () => {
    const res = await testApp().patch(`/api/users/${hr.user.id}/status`).set(auth(hr.token)).send({ isActive: false });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('errors.user.cannotDeactivateSelf');
  });

  it('protects the last active super admin', async () => {
    const sa = await createUser({ role: 'super_admin', withEmployee: false });
    await db.user.update({ where: { email: process.env.ADMIN_EMAIL! }, data: { isActive: false } });
    const other = await createUser({ role: 'super_admin', withEmployee: false });
    // two active super admins: deactivating one is fine
    expect((await testApp().patch(`/api/users/${other.user.id}/status`).set(auth(sa.token)).send({ isActive: false })).status).toBe(200);
    // sa is now the last one: removing its super_admin role is refused
    const res = await testApp().put(`/api/users/${sa.user.id}`).set(auth(sa.token)).send({ roleCodes: ['hr_admin'] });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('errors.role.lastSuperAdmin');
  });

  it('issues a single-use reset link', async () => {
    const target = await createUser({ role: 'employee' });
    const link = await testApp().post(`/api/users/${target.user.id}/reset-link`).set(auth(hr.token));
    expect(link.status).toBe(200);
    expect(link.body.data.url).toMatch(/\/reset-password\?token=/);
    const token = new URL(link.body.data.url).searchParams.get('token');
    expect((await testApp().post('/api/auth/reset-password').send({ token, newPassword: 'Fresh1234' })).status).toBe(204);
    expect((await testApp().post('/api/auth/login').send({ email: target.user.email, password: 'Fresh1234' })).status).toBe(200);
    const again = await testApp().post('/api/auth/reset-password').send({ token, newPassword: 'Other1234' });
    expect(again.status).toBe(400);
    expect(again.body.error.message).toBe('errors.auth.invalidToken');
  });

  it('rejects an expired reset link', async () => {
    const target = await createUser({ role: 'employee' });
    const link = await testApp().post(`/api/users/${target.user.id}/reset-link`).set(auth(hr.token));
    const token = new URL(link.body.data.url).searchParams.get('token');
    await db.refreshToken.updateMany({ where: { type: 'password_reset' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await testApp().post('/api/auth/reset-password').send({ token, newPassword: 'Fresh1234' })).status).toBe(400);
  });

  it('treats % and _ in the search as literal characters (Review Focus 4)', async () => {
    const role = await db.role.findUniqueOrThrow({ where: { code: 'employee' } });
    for (const email of ['a%b@test.la', 'axb@test.la', 'a_c@test.la']) {
      await db.user.create({ data: { email, passwordHash: 'x', roles: { create: { roleId: role.id } } } });
    }
    const pct = await testApp().get('/api/users?search=%25').set(auth(hr.token));
    expect(pct.body.data.map((u: any) => u.email)).toEqual(['a%b@test.la']);
    const under = await testApp().get('/api/users?search=a_').set(auth(hr.token));
    expect(under.body.data.map((u: any) => u.email)).toEqual(['a_c@test.la']);
  });

  it('sorts users who never signed in like before: last on ascending, first on descending', async () => {
    await db.user.updateMany({ data: { lastLoginAt: new Date('2026-11-01T08:00:00Z') } });
    const never = await createUser({ role: 'employee' });
    const asc = (await testApp().get('/api/users?sort=lastLoginAt:asc&pageSize=100').set(auth(hr.token))).body.data.map((u: any) => u.id);
    const desc = (await testApp().get('/api/users?sort=lastLoginAt:desc&pageSize=100').set(auth(hr.token))).body.data.map((u: any) => u.id);
    expect(asc.at(-1)).toBe(never.user.id);
    expect(desc[0]).toBe(never.user.id);
  });
});
