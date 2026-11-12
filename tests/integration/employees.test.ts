import { resetDb } from '../helpers/db.js';
import { createDepartment, createEmployee, createPosition, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function payload(over: Record<string, unknown> = {}) {
  const d = await createDepartment();
  const p = await createPosition({ departmentId: d.id });
  return {
    employeeCode: 'EMP0100', firstName: 'ສົມພອນ', lastName: 'ແກ້ວມະນີ', gender: 'male', dateOfBirth: '1992-05-10',
    phone: '02055551234', email: 'somphone@test.la', address: 'ນະຄອນຫຼວງວຽງຈັນ', departmentId: d.id, positionId: p.id,
    hireDate: '2024-03-01', basicSalary: 8500000, emergencyContactName: 'ນາງ ນາລີ', emergencyContactPhone: '02099998888',
    emergencyContactRelation: 'ເມຍ', ...over,
  };
}

describe('employees', () => {
  it('lets an employee change their own personal and contact details, but not job or pay', async () => {
    const u = await createUser({ role: 'employee', employee: { firstName: 'Old', basicSalary: 5000000, hireDate: '2024-01-01' } });
    const body = { firstName: 'ນາລີ', lastName: 'ວົງສະຫວັນ', gender: 'female', dateOfBirth: '1995-04-20', phone: '020 5555 9999', address: 'ບ້ານໂພນໄຊ', emergencyContactName: 'ແມ່', emergencyContactPhone: '02077778888', emergencyContactRelation: 'ແມ່', basicSalary: 99, email: 'x@y.la' };
    const r = await testApp().put('/api/employees/me').set(auth(u.token)).send(body);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ firstName: 'ນາລີ', lastName: 'ວົງສະຫວັນ', gender: 'female', dateOfBirth: '1995-04-20', phone: '020 5555 9999', address: 'ບ້ານໂພນໄຊ', basicSalary: '5000000.00', email: u.employee!.email });
    const bad = await testApp().put('/api/employees/me').set(auth(u.token)).send({ ...body, phone: 'abc', firstName: '' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual(expect.arrayContaining([{ field: 'phone', message: 'errors.validation.phone' }, { field: 'firstName', message: 'errors.validation.required' }]));
    const young = await testApp().put('/api/employees/me').set(auth(u.token)).send({ ...body, dateOfBirth: '2015-01-01' });
    expect(young.body.error.details).toContainEqual({ field: 'dateOfBirth', message: 'errors.employee.tooYoung' });
    const noEmployee = await createUser({ role: 'hr_admin', withEmployee: false });
    expect((await testApp().put('/api/employees/me').set(auth(noEmployee.token)).send(body)).status).toBe(404);
  });


  let hr: string;
  beforeEach(async () => {
    await resetDb();
    hr = (await createUser({ role: 'hr_admin' })).token;
  });

  it('creates an employee with a login account in one step', async () => {
    const body = await payload({ account: { email: 'somphone@test.la', password: 'Welcome123', roleCodes: ['employee'] } });
    const res = await testApp().post('/api/employees').set(auth(hr)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.user.roles).toEqual(['employee']);
    const login = await testApp().post('/api/auth/login').send({ email: 'somphone@test.la', password: 'Welcome123' });
    expect(login.status).toBe(200);
  });

  it('creates nothing when the code is a duplicate', async () => {
    await createEmployee({ employeeCode: 'EMP0100' });
    const body = await payload({ account: { email: 'new@test.la', password: 'Welcome123', roleCodes: ['employee'] } });
    const res = await testApp().post('/api/employees').set(auth(hr)).send(body);
    expect(res.status).toBe(409);
    const login = await testApp().post('/api/auth/login').send({ email: 'new@test.la', password: 'Welcome123' });
    expect(login.status).toBe(401);
  });

  it('finds Lao names by partial text and Latin names case-insensitively (Review Focus 3)', async () => {
    await testApp().post('/api/employees').set(auth(hr)).send(await payload());
    await createEmployee({ firstName: 'John', lastName: 'Smith' });
    const a = await testApp().get(`/api/employees?search=${encodeURIComponent('ສົມ')}`).set(auth(hr));
    expect(a.body.data.map((e: any) => e.firstName)).toEqual(['ສົມພອນ']);
    const b = await testApp().get(`/api/employees?search=${encodeURIComponent('ແກ້ວ')}`).set(auth(hr));
    expect(b.body.data).toHaveLength(1);
    const c = await testApp().get('/api/employees?search=JOHN').set(auth(hr));
    expect(c.body.data.map((e: any) => e.firstName)).toEqual(['John']);
  });

  it('filters by department and status and sorts by hire date', async () => {
    const d = await createDepartment();
    await createEmployee({ departmentId: d.id, hireDate: '2020-01-01' });
    await createEmployee({ departmentId: d.id, hireDate: '2023-01-01' });
    await createEmployee({ departmentId: d.id, hireDate: '2022-01-01', employmentStatus: 'inactive' });
    await createEmployee();
    const res = await testApp().get(`/api/employees?departmentId=${d.id}&status=active&sort=hireDate:desc`).set(auth(hr));
    expect(res.body.data.map((e: any) => e.hireDate)).toEqual(['2023-01-01', '2020-01-01']);
    expect(res.body.meta.total).toBe(2);
  });

  it('limits a manager to their department and hides salary', async () => {
    const mgr = await createUser({ role: 'manager' });
    const mine = await createEmployee({ departmentId: mgr.employee!.departmentId });
    const other = await createEmployee();
    const list = await testApp().get('/api/employees?pageSize=100').set(auth(mgr.token));
    const ids = list.body.data.map((e: any) => e.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(other.id);
    const others = list.body.data.filter((e: any) => e.id !== mgr.employee!.id);
    expect(others.every((e: any) => !('basicSalary' in e))).toBe(true);
    expect(list.body.data.find((e: any) => e.id === mgr.employee!.id).basicSalary).toBeDefined();
    expect((await testApp().get(`/api/employees/${other.id}`).set(auth(mgr.token))).status).toBe(404);
    expect((await testApp().put(`/api/employees/${mine.id}`).set(auth(mgr.token)).send({ phone: '1' })).status).toBe(403);
  });

  it('shows salary to HR', async () => {
    const e = await createEmployee({ basicSalary: '7000000' });
    const res = await testApp().get(`/api/employees/${e.id}`).set(auth(hr));
    expect(res.body.data.basicSalary).toBe('7000000.00');
  });

  it('forbids the employee role from listing employees', async () => {
    const { token } = await createUser({ role: 'employee' });
    expect((await testApp().get('/api/employees').set(auth(token))).status).toBe(403);
  });

  it('deactivates on delete and blocks that user immediately', async () => {
    const u = await createUser({ role: 'employee' });
    expect((await testApp().delete(`/api/employees/${u.employee!.id}`).set(auth(hr))).status).toBe(204);
    const res = await testApp().get(`/api/employees/${u.employee!.id}`).set(auth(hr));
    expect(res.body.data.employmentStatus).toBe('inactive');
    expect(res.body.data.user.isActive).toBe(false);
    expect((await testApp().get('/api/auth/me').set(auth(u.token))).status).toBe(401);
  });

  it('changes status and reactivates', async () => {
    const u = await createUser({ role: 'employee' });
    await testApp().patch(`/api/employees/${u.employee!.id}/status`).set(auth(hr)).send({ status: 'terminated' });
    const res = await testApp().patch(`/api/employees/${u.employee!.id}/status`).set(auth(hr)).send({ status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.data.employmentStatus).toBe('active');
    expect(res.body.data.user.isActive).toBe(true);
  });

  it('uploads a profile photo', async () => {
    const e = await createEmployee();
    const res = await testApp().post(`/api/employees/${e.id}/photo`).set(auth(hr)).attach('photo', PNG, 'me.png');
    expect(res.status).toBe(200);
    expect(res.body.data.photoUrl).toMatch(/^\/api\/files\/photos\/.+\.png$/);
  });

  it('rejects a position from another department', async () => {
    const body = await payload({ positionId: (await createPosition()).id });
    const res = await testApp().post('/api/employees').set(auth(hr)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('errors.employee.positionMismatch');
  });

  it('validates dates and required fields', async () => {
    const young = await testApp().post('/api/employees').set(auth(hr)).send(await payload({ dateOfBirth: '2015-01-01' }));
    expect(young.status).toBe(400);
    expect(young.body.error.details[0].field).toBe('dateOfBirth');
    const missing = await testApp().post('/api/employees').set(auth(hr)).send({ firstName: 'x' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.map((d: any) => d.field)).toContain('employeeCode');
  });

  it('updates an employee and keeps search text current', async () => {
    const e = await createEmployee({ firstName: 'Old' });
    const res = await testApp().put(`/api/employees/${e.id}`).set(auth(hr)).send({ firstName: 'ບຸນມີ' });
    expect(res.status).toBe(200);
    const found = await testApp().get(`/api/employees?search=${encodeURIComponent('ບຸນ')}`).set(auth(hr));
    expect(found.body.data.map((x: any) => x.id)).toEqual([e.id]);
  });
});

describe('own profile', () => {
  beforeEach(resetDb);
  it('lets any signed-in employee read their own record', async () => {
    const u = await createUser({ role: 'employee' });
    const res = await testApp().get('/api/employees/me').set(auth(u.token));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(u.employee!.id);
    expect(res.body.data.basicSalary).toBeDefined();
  });
  it('returns 404 for an account without an employee', async () => {
    const sa = await createUser({ role: 'super_admin', withEmployee: false });
    expect((await testApp().get('/api/employees/me').set(auth(sa.token))).status).toBe(404);
  });

  it('keeps calendar dates and the salary format on a non-UTC server (Review Focus 1 and 3)', async () => {
    const hr = (await createUser({ role: 'hr_admin' })).token;
    const created = await testApp().post('/api/employees').set(auth(hr)).send(await payload({ hireDate: '2026-11-01', basicSalary: 8500000 }));
    expect(created.status).toBe(201);
    const got = (await testApp().get(`/api/employees/${created.body.data.id}`).set(auth(hr))).body.data;
    expect(got).toMatchObject({ hireDate: '2026-11-01', dateOfBirth: '1992-05-10', basicSalary: '8500000.00' });
  });

  it('treats % and _ in the search as literal characters (Review Focus 4)', async () => {
    const hr = (await createUser({ role: 'hr_admin' })).token;
    await createEmployee({ firstName: 'Anna' });
    await createEmployee({ firstName: 'Bo_b' });
    const pct = await testApp().get('/api/employees?search=%25').set(auth(hr));
    expect(pct.body.data).toEqual([]);
    const under = await testApp().get('/api/employees?search=o_').set(auth(hr));
    expect(under.body.data.map((e: any) => e.firstName)).toEqual(['Bo_b']);
  });
});
