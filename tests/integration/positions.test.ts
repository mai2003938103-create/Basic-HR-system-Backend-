import { resetDb } from '../helpers/db.js';
import { createDepartment, createEmployee, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

describe('positions', () => {
  let hr: string;
  beforeEach(async () => {
    await resetDb();
    hr = (await createUser({ role: 'hr_admin' })).token;
  });

  it('creates and filters by department', async () => {
    const d1 = await createDepartment();
    const d2 = await createDepartment();
    const res = await testApp().post('/api/positions').set(auth(hr)).send({ code: 'ACC', nameLo: 'ບັນຊີ', nameEn: 'Accountant', departmentId: d1.id });
    expect(res.status).toBe(201);
    expect(res.body.data.department.id).toBe(d1.id);
    await testApp().post('/api/positions').set(auth(hr)).send({ code: 'DEV', nameLo: 'ນັກພັດທະນາ', nameEn: 'Developer', departmentId: d2.id });
    const list = await testApp().get(`/api/positions?departmentId=${d1.id}`).set(auth(hr));
    expect(list.body.data.map((p: any) => p.code)).toEqual(['ACC']);
  });

  it('rejects an unknown department', async () => {
    const res = await testApp().post('/api/positions').set(auth(hr)).send({ code: 'Z', nameLo: 'z', nameEn: 'z', departmentId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('errors.position.invalidDepartment');
  });

  it('blocks deleting a position in use', async () => {
    const e = await createEmployee();
    const res = await testApp().delete(`/api/positions/${e.positionId}`).set(auth(hr));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('errors.position.inUse');
  });

  it('updates a position', async () => {
    const d = await createDepartment();
    const p = (await testApp().post('/api/positions').set(auth(hr)).send({ code: 'U1', nameLo: 'u', nameEn: 'u', departmentId: d.id })).body.data;
    const res = await testApp().put(`/api/positions/${p.id}`).set(auth(hr)).send({ nameEn: 'Updated', isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ nameEn: 'Updated', isActive: false });
  });
});
