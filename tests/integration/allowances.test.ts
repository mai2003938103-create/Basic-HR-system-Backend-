import { prisma as db, resetDb } from '../helpers/db.js';
import { createDepartment, createEmployee, createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

const typeOf = async (code: string) => db.allowanceType.findUniqueOrThrow({ where: { code } });

describe('allowances', () => {
  let hr: string;
  beforeEach(async () => {
    await resetDb();
    hr = (await createUser({ role: 'hr_admin' })).token;
  });

  it('creates, lists and updates allowance types and refuses a duplicate code', async () => {
    const created = await testApp().post('/api/allowance-types').set(auth(hr)).send({ code: 'PHONE', nameLo: 'ຄ່າໂທລະສັບ', nameEn: 'Phone', taxable: false }).expect(201);
    expect(created.body.data).toMatchObject({ code: 'PHONE', taxable: false, isActive: true });
    const dup = await testApp().post('/api/allowance-types').set(auth(hr)).send({ code: 'PHONE', nameLo: 'x', nameEn: 'x' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('errors.common.duplicate');
    await testApp().put(`/api/allowance-types/${created.body.data.id}`).set(auth(hr)).send({ isActive: false }).expect(200);
    const list = await testApp().get('/api/allowance-types').set(auth(hr)).expect(200);
    expect(list.body.data.map((t: any) => t.code)).toEqual(['MEAL', 'PHONE', 'POSITION', 'TRANSPORT']);
    const emp = await createUser({ role: 'employee' });
    await testApp().post('/api/allowance-types').set(auth(emp.token)).send({ code: 'X1', nameLo: 'x', nameEn: 'x' }).expect(403);
  });

  it("replaces an employee's allowances, where amount 0 removes one", async () => {
    const e = await createEmployee();
    const [meal, transport] = [await typeOf('MEAL'), await typeOf('TRANSPORT')];
    await testApp().put(`/api/employees/${e.id}/allowances`).set(auth(hr)).send({ items: [{ typeId: meal.id, amount: 300000 }, { typeId: transport.id, amount: 200000 }] }).expect(200);
    const res = await testApp().put(`/api/employees/${e.id}/allowances`).set(auth(hr)).send({ items: [{ typeId: meal.id, amount: 350000 }, { typeId: transport.id, amount: 0 }] }).expect(200);
    expect(res.body.data).toEqual([{ typeId: meal.id, code: 'MEAL', nameLo: meal.nameLo, nameEn: meal.nameEn, taxable: true, amount: 350000 }]);
    const got = await testApp().get(`/api/employees/${e.id}/allowances`).set(auth(hr)).expect(200);
    expect(got.body.data).toEqual(res.body.data);
    const bad = await testApp().put(`/api/employees/${e.id}/allowances`).set(auth(hr)).send({ items: [{ typeId: meal.id, amount: -5 }] });
    expect(bad.status).toBe(400);
  });

  it('keeps allowances out of reach without payroll.read and outside a department scope', async () => {
    const other = await createEmployee();
    const manager = await createUser({ role: 'manager' });
    await testApp().get(`/api/employees/${other.id}/allowances`).set(auth(manager.token)).expect(403);
    // A department-scoped role that may read payroll still only sees its own department.
    const mgrRole = await db.role.findUniqueOrThrow({ where: { code: 'manager' } });
    const perm = await db.permission.findUniqueOrThrow({ where: { code: 'payroll.read' } });
    await db.rolePermission.create({ data: { roleId: mgrRole.id, permissionId: perm.id } });
    await testApp().get(`/api/employees/${other.id}/allowances`).set(auth(manager.token)).expect(404);
    const own = await createEmployee({ departmentId: manager.employee!.departmentId });
    await testApp().get(`/api/employees/${own.id}/allowances`).set(auth(manager.token)).expect(200);
  });

  it('shows bank details and end date to HR and to the employee, not to a manager', async () => {
    const d = await createDepartment();
    const manager = await createUser({ role: 'manager', departmentId: d.id });
    const self = await createUser({ role: 'employee', departmentId: d.id, employee: { bankName: 'BCEL', bankAccount: '010-12-00-1234' } });
    const id = self.employee!.id;
    const asHr = (await testApp().get(`/api/employees/${id}`).set(auth(hr)).expect(200)).body.data;
    expect(asHr).toMatchObject({ bankName: 'BCEL', bankAccount: '010-12-00-1234', endDate: null });
    const asSelf = (await testApp().get('/api/employees/me').set(auth(self.token)).expect(200)).body.data;
    expect(asSelf).toMatchObject({ bankName: 'BCEL', bankAccount: '010-12-00-1234' });
    const asMgr = (await testApp().get(`/api/employees/${id}`).set(auth(manager.token)).expect(200)).body.data;
    expect(asMgr).not.toHaveProperty('bankName');
    expect(asMgr).not.toHaveProperty('bankAccount');
    expect(asMgr).not.toHaveProperty('endDate');
    await testApp().put(`/api/employees/${id}`).set(auth(hr)).send({ bankName: 'LDB', bankAccount: '0300-555' }).expect(200);
    expect((await testApp().get(`/api/employees/${id}`).set(auth(hr))).body.data).toMatchObject({ bankName: 'LDB', bankAccount: '0300-555' });
  });
});
