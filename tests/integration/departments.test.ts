import { resetDb } from '../helpers/db.js';
import { createEmployee, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

describe('departments', () => {
  let hr: string;
  let emp: string;
  beforeEach(async () => {
    await resetDb();
    hr = (await createUser({ role: 'hr_admin' })).token;
    emp = (await createUser({ role: 'employee' })).token;
  });

  const create = (token: string, body: object) => testApp().post('/api/departments').set(auth(token)).send(body);

  it('creates, searches, sorts and paginates', async () => {
    expect((await create(hr, { code: 'FIN', nameLo: 'ການເງິນ', nameEn: 'Finance' })).status).toBe(201);
    await create(hr, { code: 'OPS', nameLo: 'ປະຕິບັດການ', nameEn: 'Operations' });
    const found = await testApp().get('/api/departments?search=fin').set(auth(hr));
    expect(found.body.data.map((d: any) => d.code)).toEqual(['FIN']);
    const sorted = await testApp().get('/api/departments?sort=nameEn:desc&pageSize=100').set(auth(hr));
    expect(sorted.body.data[0].nameEn >= sorted.body.data[1].nameEn).toBe(true);
    const paged = await testApp().get('/api/departments?pageSize=1').set(auth(hr));
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.total).toBeGreaterThanOrEqual(4);
  });

  it('updates and assigns an active manager', async () => {
    const d = (await create(hr, { code: 'HRD', nameLo: 'ບຸກຄະລາກອນ', nameEn: 'HR' })).body.data;
    const m = await createEmployee({ departmentId: d.id });
    const res = await testApp().put(`/api/departments/${d.id}`).set(auth(hr)).send({ nameEn: 'Human Resources', managerId: m.id });
    expect(res.status).toBe(200);
    expect(res.body.data.nameEn).toBe('Human Resources');
    expect(res.body.data.manager.id).toBe(m.id);
  });

  it('rejects an inactive manager', async () => {
    const d = (await create(hr, { code: 'X1', nameLo: 'x', nameEn: 'x' })).body.data;
    const m = await createEmployee({ departmentId: d.id, employmentStatus: 'inactive' });
    const res = await testApp().put(`/api/departments/${d.id}`).set(auth(hr)).send({ managerId: m.id });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('errors.department.invalidManager');
  });

  it('lets employees read but not write', async () => {
    expect((await create(emp, { code: 'NO', nameLo: 'x', nameEn: 'x' })).status).toBe(403);
  });

  it('rejects a duplicate code', async () => {
    await create(hr, { code: 'DUP', nameLo: 'x', nameEn: 'x' });
    expect((await create(hr, { code: 'DUP', nameLo: 'y', nameEn: 'y' })).status).toBe(409);
  });

  it('blocks deleting a department in use and deletes an empty one', async () => {
    const used = (await create(hr, { code: 'USED', nameLo: 'x', nameEn: 'x' })).body.data;
    await createEmployee({ departmentId: used.id });
    const r1 = await testApp().delete(`/api/departments/${used.id}`).set(auth(hr));
    expect(r1.status).toBe(409);
    expect(r1.body.error.message).toBe('errors.department.inUse');
    const empty = (await create(hr, { code: 'EMPTY', nameLo: 'x', nameEn: 'x' })).body.data;
    expect((await testApp().delete(`/api/departments/${empty.id}`).set(auth(hr))).status).toBe(204);
    expect((await testApp().get(`/api/departments/${empty.id}`).set(auth(hr))).status).toBe(404);
  });

  it('reports the employee count', async () => {
    const d = (await create(hr, { code: 'CNT', nameLo: 'x', nameEn: 'x' })).body.data;
    await createEmployee({ departmentId: d.id });
    await createEmployee({ departmentId: d.id });
    const res = await testApp().get(`/api/departments/${d.id}`).set(auth(hr));
    expect(res.body.data.employeeCount).toBe(2);
  });

  it('treats _ in the search as a literal character (Review Focus 4)', async () => {
    await create(hr, { code: 'A_B', nameLo: 'ພະແນກ ກ', nameEn: 'Alpha' });
    await create(hr, { code: 'AXB', nameLo: 'ພະແນກ ຂ', nameEn: 'Beta' });
    const res = await testApp().get('/api/departments?search=_').set(auth(hr));
    expect(res.body.data.map((d: any) => d.code)).toEqual(['A_B']);
  });
});
