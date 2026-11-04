// Pure payroll maths (spec §5.2). Integer kip only: every division rounds half up with BigInt.
import type { PayrollConfig } from './config.js';

/** round_half_up(a × b / c) for non-negative integers. */
export function mulDivRound(a: number, b: number, c: number): number {
  const num = BigInt(a) * BigInt(b) * 2n + BigInt(c);
  return Number(num / (2n * BigInt(c)));
}

/** amount × rate% rounded half up; the rate may carry two decimals (5.5 %). */
export const pct = (amount: number, ratePercent: number) => mulDivRound(amount, Math.round(ratePercent * 100), 10000);

export interface PayAllowance { typeId: string; code: string; nameLo: string; nameEn: string; amount: number; taxable: boolean }
export interface PayInput {
  basic: number;
  periodWorkDays: number;
  paidWorkDays: number;
  allowances: PayAllowance[];
  overtimeMinutesWeekday: number;
  overtimeMinutesRestday: number;
  bonus: number;
  otherDeduction: number;
  unpaidDays: number;
}
export interface TaxStep { from: number; to: number | null; rate: number; amount: number; tax: number }
export interface PayResult {
  basicEarned: number;
  allowanceTotal: number;
  nonTaxableAllowances: number;
  overtimeHoursWeekday: number;
  overtimeHoursRestday: number;
  overtimePay: number;
  unpaidDeduction: number;
  gross: number;
  ssBase: number;
  ssEmployee: number;
  ssEmployer: number;
  taxable: number;
  incomeTax: number;
  totalDeductions: number;
  net: number;
  employerCost: number;
  taxSteps: TaxStep[];
}

export class NegativeNetError extends Error {
  constructor() {
    super('errors.payroll.negativeNet');
  }
}

export function progressiveTax(taxable: number, brackets: PayrollConfig['incomeTax']['brackets']): { total: number; steps: TaxStep[] } {
  let prev = 0;
  let total = 0;
  const steps: TaxStep[] = [];
  for (const b of brackets) {
    if (taxable <= prev) break;
    const cap = b.upTo ?? Number.MAX_SAFE_INTEGER;
    const amount = Math.min(taxable, cap) - prev;
    const tax = pct(amount, b.rate);
    steps.push({ from: prev, to: b.upTo, rate: b.rate, amount, tax });
    total += tax;
    prev = cap;
  }
  return { total, steps };
}

export function calculatePayItem(input: PayInput, config: PayrollConfig): PayResult {
  const prorate = config.proration === 'workingDays' && input.paidWorkDays < input.periodWorkDays && input.periodWorkDays > 0;
  const share = (x: number) => (prorate ? mulDivRound(x, input.paidWorkDays, input.periodWorkDays) : x);

  const basicEarned = share(input.basic);
  const allowances = input.allowances.map((a) => ({ ...a, amount: share(a.amount) }));
  const allowanceTotal = allowances.reduce((s, a) => s + a.amount, 0);
  const nonTaxableAllowances = allowances.filter((a) => !a.taxable).reduce((s, a) => s + a.amount, 0);

  const otDenominator = config.workDaysPerMonth * config.hoursPerDay * 60 * 10000;
  const otPart = (minutes: number, rate: number) => mulDivRound(input.basic * minutes, Math.round(rate * 100), otDenominator);
  const overtimePay = otPart(input.overtimeMinutesWeekday, config.overtime.weekdayRate) + otPart(input.overtimeMinutesRestday, config.overtime.restDayRate);
  const unpaidDeduction = mulDivRound(input.basic, Math.round(input.unpaidDays * 10), config.workDaysPerMonth * 10);

  const gross = basicEarned + allowanceTotal + overtimePay + input.bonus - unpaidDeduction;
  const ssBase = Math.max(0, Math.min(gross, config.socialSecurity.ceiling));
  const ssEmployee = pct(ssBase, config.socialSecurity.employeeRate);
  const ssEmployer = pct(ssBase, config.socialSecurity.employerRate);
  const taxable = Math.max(0, gross - nonTaxableAllowances - (config.incomeTax.deductSocialSecurity ? ssEmployee : 0));
  const { total: incomeTax, steps: taxSteps } = progressiveTax(taxable, config.incomeTax.brackets);
  const totalDeductions = ssEmployee + incomeTax + input.otherDeduction;
  const net = gross - totalDeductions;
  if (net < 0) throw new NegativeNetError();

  return {
    basicEarned, allowanceTotal, nonTaxableAllowances,
    overtimeHoursWeekday: input.overtimeMinutesWeekday / 60, overtimeHoursRestday: input.overtimeMinutesRestday / 60,
    overtimePay, unpaidDeduction, gross, ssBase, ssEmployee, ssEmployer, taxable, incomeTax, totalDeductions, net,
    employerCost: gross + ssEmployer, taxSteps,
  };
}
