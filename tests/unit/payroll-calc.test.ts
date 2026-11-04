import { DEFAULT_PAYROLL_CONFIG as cfg } from '../../src/services/payroll/config.js';
import { NegativeNetError, calculatePayItem, mulDivRound, pct, type PayInput } from '../../src/services/payroll/calc.js';

const base: PayInput = {
  basic: 0, periodWorkDays: 22, paidWorkDays: 22, allowances: [], overtimeMinutesWeekday: 0, overtimeMinutesRestday: 0, bonus: 0, otherDeduction: 0, unpaidDays: 0,
};
const allowance = (amount: number, taxable = true) => ({ typeId: 't', code: 'POSITION', nameLo: 'x', nameEn: 'x', amount, taxable });
const run = (over: Partial<PayInput>) => calculatePayItem({ ...base, ...over }, cfg);

describe('calculatePayItem (general defaults, spec §5.6)', () => {
  it('pays no tax below the first bracket', () => {
    const r = run({ basic: 2000000 });
    expect(r).toMatchObject({ ssEmployee: 110000, incomeTax: 0, net: 1890000 });
  });

  it('caps social security at the ceiling and taxes two brackets', () => {
    const r = run({ basic: 6000000 });
    expect(r).toMatchObject({ ssBase: 4500000, ssEmployee: 247500, ssEmployer: 270000, taxable: 5752500, incomeTax: 200250, net: 5552250, employerCost: 6270000 });
    expect(r.taxSteps.map((s) => s.rate)).toEqual([0, 5, 10]);
  });

  it('runs through every bracket including the open last one', () => {
    const r = run({ basic: 70000000 });
    expect(r.incomeTax).toBe(11813125);
    expect(r.taxSteps.at(-1)).toEqual({ from: 65000000, to: null, rate: 25, amount: 4752500, tax: 1188125 });
    expect(r.net).toBe(57939375);
  });

  it('prorates basic and allowances for a mid-month joiner', () => {
    const r = run({ basic: 6000000, paidWorkDays: 12, allowances: [allowance(1000000)] });
    expect(r).toMatchObject({ basicEarned: 3272727, allowanceTotal: 545455, gross: 3818182, incomeTax: 55409, net: 3552773 });
  });

  it('deducts unpaid leave by the daily rate', () => {
    const r = run({ basic: 6000000, unpaidDays: 1.5 });
    expect(r).toMatchObject({ unpaidDeduction: 409091, gross: 5590909, net: 5184068 });
  });

  it('pays weekday and rest-day overtime at their own rates', () => {
    const r = run({ basic: 8800000, overtimeMinutesWeekday: 600, overtimeMinutesRestday: 240 });
    expect(r).toMatchObject({ overtimeHoursWeekday: 10, overtimeHoursRestday: 4, overtimePay: 1250000, gross: 10050000, net: 9197250 });
  });

  it('keeps a non-taxable allowance in gross but out of taxable income', () => {
    const r = run({ basic: 6000000, allowances: [allowance(500000, false)] });
    expect(r).toMatchObject({ gross: 6500000, nonTaxableAllowances: 500000, taxable: 5752500, net: 6052250 });
  });

  it('refuses a deduction that makes net pay negative', () => {
    expect(() => run({ basic: 2000000, otherDeduction: 3000000 })).toThrow(NegativeNetError);
  });

  it('rounds half up in whole kip and keeps net = gross − deductions', () => {
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(5, 1, 4)).toBe(1);
    expect(mulDivRound(3, 1, 4)).toBe(1);
    expect(pct(15, 10)).toBe(2);
    for (const over of [{ basic: 2000000 }, { basic: 6000000, paidWorkDays: 12, allowances: [allowance(1000000)] }, { basic: 6000000, unpaidDays: 1.5 }, { basic: 8800000, overtimeMinutesWeekday: 37 }]) {
      const r = run(over);
      expect(r.net).toBe(r.gross - r.totalDeductions);
      for (const [k, v] of Object.entries(r)) if (typeof v === 'number' && !k.startsWith('overtimeHours')) expect(Number.isInteger(v)).toBe(true);
    }
  });
});
