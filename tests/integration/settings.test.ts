import { DEFAULT_PAYROLL_CONFIG } from '../../src/modules/payroll/config.js';
import { resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

const { confirmedBy: _b, confirmedAt: _a, ...editable } = DEFAULT_PAYROLL_CONFIG;
const withBrackets = (brackets: { upTo: number | null; rate: number }[]) => ({ ...editable, incomeTax: { ...editable.incomeTax, brackets } });

describe('settings', () => {
  let hr: string;
  beforeEach(async () => {
    await resetDb();
    hr = (await createUser({ role: 'hr_admin' })).token;
  });

  it('is only for settings.manage and returns the payroll defaults', async () => {
    const emp = await createUser({ role: 'employee' });
    await testApp().get('/api/settings').set(auth(emp.token)).expect(403);
    const res = await testApp().get('/api/settings').set(auth(hr)).expect(200);
    expect(res.body.data.payroll).toEqual(DEFAULT_PAYROLL_CONFIG);
    expect(res.body.data).toMatchObject({ companyNameLo: expect.any(String), workStart: '08:00', currencyCode: 'LAK' });
  });

  it('refuses brackets out of order, an open bracket that is not last and impossible rates (Review Focus 4)', async () => {
    const before = (await testApp().get('/api/settings').set(auth(hr))).body.data;
    const bad = await testApp().put('/api/settings/payroll').set(auth(hr)).send(withBrackets([{ upTo: 5000000, rate: 5 }, { upTo: 2500000, rate: 10 }, { upTo: null, rate: 20 }]));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toContainEqual({ field: 'incomeTax.brackets', message: 'errors.settings.bracketOrder' });
    await testApp().put('/api/settings/payroll').set(auth(hr)).send(withBrackets([{ upTo: 2500000, rate: 0 }, { upTo: 1000, rate: 5 }])).expect(400);
    await testApp().put('/api/settings/payroll').set(auth(hr)).send({ ...editable, socialSecurity: { ...editable.socialSecurity, employeeRate: 150 } }).expect(400);
    expect((await testApp().get('/api/settings').set(auth(hr))).body.data).toEqual(before);
  });

  it('saves payroll rules unconfirmed, confirms them, and previews one salary', async () => {
    await testApp().post('/api/settings/payroll/confirm').set(auth(hr)).expect(200);
    const saved = await testApp().put('/api/settings/payroll').set(auth(hr)).send({ ...editable, payDay: 28 }).expect(200);
    expect(saved.body.data.payroll).toMatchObject({ payDay: 28, confirmedBy: null, confirmedAt: null });
    const confirmed = await testApp().post('/api/settings/payroll/confirm').set(auth(hr)).expect(200);
    expect(confirmed.body.data.payroll.confirmedAt).toEqual(expect.any(String));
    expect(confirmed.body.data.payroll.confirmedBy).toEqual(expect.any(String));
    const preview = await testApp().post('/api/settings/payroll/preview').set(auth(hr)).send({ gross: 6000000 }).expect(200);
    expect(preview.body.data).toMatchObject({ gross: 6000000, ssEmployee: 247500, incomeTax: 200250, net: 5552250 });
  });

  it('updates company details and working time, refusing an end before the start', async () => {
    const co = await testApp().put('/api/settings/company').set(auth(hr)).send({ companyNameLo: 'ບໍລິສັດ ທົດສອບ', companyNameEn: 'Test Co', addressLo: 'ວຽງຈັນ', taxId: '123', currencyCode: 'LAK', currencySymbol: '₭' }).expect(200);
    expect(co.body.data).toMatchObject({ companyNameEn: 'Test Co', addressLo: 'ວຽງຈັນ', taxId: '123' });
    const bad = await testApp().put('/api/settings/work-time').set(auth(hr)).send({ workingDays: [1, 2, 3, 4, 5], workStart: '17:00', workEnd: '08:00', lateGraceMinutes: 15, halfDayMinutes: 240 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toContainEqual({ field: 'workEnd', message: 'errors.settings.endBeforeStart' });
    const ok = await testApp().put('/api/settings/work-time').set(auth(hr)).send({ workingDays: [1, 2, 3, 4, 5, 6], workStart: '07:30', workEnd: '16:30', lateGraceMinutes: 10, halfDayMinutes: 240 }).expect(200);
    expect(ok.body.data).toMatchObject({ workingDays: [1, 2, 3, 4, 5, 6], workStart: '07:30' });
    expect((await testApp().get('/api/settings/public').set(auth(hr))).body.data).toMatchObject({ companyNameEn: 'Test Co', workStart: '07:30' });
  });
});
