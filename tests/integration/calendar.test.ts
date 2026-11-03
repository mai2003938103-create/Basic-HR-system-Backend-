import { resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

describe('settings, holidays, leave types', () => {
  let hr: string;
  let emp: string;
  beforeEach(async () => {
    await resetDb();
    hr = (await createUser({ role: 'hr_admin' })).token;
    emp = (await createUser({ role: 'employee' })).token;
  });

  it('exposes public settings to any signed-in user', async () => {
    const res = await testApp().get('/api/settings/public').set(auth(emp));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ currencyCode: 'LAK', currencySymbol: '₭', workingDays: [1, 2, 3, 4, 5], workStart: '08:00', workEnd: '17:00' });
  });

  it('manages holidays and rejects duplicate dates', async () => {
    const a = await testApp().post('/api/holidays').set(auth(hr)).send({ date: '2026-12-02', nameLo: 'ວັນຊາດ', nameEn: 'National Day' });
    expect(a.status).toBe(201);
    expect((await testApp().post('/api/holidays').set(auth(hr)).send({ date: '2026-12-02', nameLo: 'x', nameEn: 'x' })).status).toBe(409);
    const list = await testApp().get('/api/holidays?year=2026').set(auth(emp));
    expect(list.body.data.map((h: any) => h.date)).toEqual(['2026-12-02']);
    expect((await testApp().delete(`/api/holidays/${a.body.data.id}`).set(auth(hr))).status).toBe(204);
    expect((await testApp().post('/api/holidays').set(auth(emp)).send({ date: '2026-12-03', nameLo: 'x', nameEn: 'x' })).status).toBe(403);
  });

  it('lists leave types for everyone and limits edits to leave.manage', async () => {
    const list = await testApp().get('/api/leave-types').set(auth(emp));
    expect(list.body.data).toHaveLength(5);
    expect((await testApp().post('/api/leave-types').set(auth(emp)).send({ code: 'X', nameLo: 'x', nameEn: 'x', defaultDaysPerYear: 1 })).status).toBe(403);
    const created = await testApp().post('/api/leave-types').set(auth(hr)).send({ code: 'STUDY', nameLo: 'ລາຮຽນ', nameEn: 'Study Leave', defaultDaysPerYear: 5, isPaid: true });
    expect(created.status).toBe(201);
    const upd = await testApp().put(`/api/leave-types/${created.body.data.id}`).set(auth(hr)).send({ defaultDaysPerYear: 6, documentRequiredAfterDays: 1 });
    expect(upd.body.data).toMatchObject({ defaultDaysPerYear: 6, documentRequiredAfterDays: 1 });
  });
});
