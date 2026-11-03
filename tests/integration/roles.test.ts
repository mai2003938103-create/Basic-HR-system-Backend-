import { resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

describe('roles', () => {
  beforeEach(resetDb);

  it('requires role.manage', async () => {
    const hr = await createUser({ role: 'hr_admin' });
    expect((await testApp().get('/api/roles').set(auth(hr.token))).status).toBe(403);
  });

  it('lists roles with their permissions and all permissions', async () => {
    const sa = await createUser({ role: 'super_admin', withEmployee: false });
    const roles = await testApp().get('/api/roles').set(auth(sa.token));
    expect(roles.body.data.find((r: any) => r.code === 'employee').permissionCodes).toContain('leave.request');
    const perms = await testApp().get('/api/permissions').set(auth(sa.token));
    expect(perms.body.data.length).toBeGreaterThan(10);
  });

  it('applies edited permissions on the next request', async () => {
    const sa = await createUser({ role: 'super_admin', withEmployee: false });
    const mgr = await createUser({ role: 'manager' });
    expect((await testApp().get('/api/departments').set(auth(mgr.token))).status).toBe(200);
    const roles = (await testApp().get('/api/roles').set(auth(sa.token))).body.data;
    const manager = roles.find((r: any) => r.code === 'manager');
    const res = await testApp().put(`/api/roles/${manager.id}`).set(auth(sa.token)).send({
      permissionCodes: manager.permissionCodes.filter((c: string) => c !== 'department.read'),
    });
    expect(res.status).toBe(200);
    expect((await testApp().get('/api/departments').set(auth(mgr.token))).status).toBe(403);
  });

  it('keeps super_admin read-only and allows custom roles', async () => {
    const sa = await createUser({ role: 'super_admin', withEmployee: false });
    const roles = (await testApp().get('/api/roles').set(auth(sa.token))).body.data;
    const saRole = roles.find((r: any) => r.code === 'super_admin');
    const res = await testApp().put(`/api/roles/${saRole.id}`).set(auth(sa.token)).send({ permissionCodes: [] });
    expect(res.status).toBe(409);
    const created = await testApp().post('/api/roles').set(auth(sa.token)).send({ code: 'auditor', nameLo: 'ຜູ້ກວດສອບ', nameEn: 'Auditor', scope: 'all', permissionCodes: ['employee.read'] });
    expect(created.status).toBe(201);
    expect(created.body.data.permissionCodes).toEqual(['employee.read']);
  });
});
