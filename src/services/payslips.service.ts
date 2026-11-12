// Payslips: an employee sees their own once the run is paid; payroll.read sees every employee's (spec §6).
import { toDateString } from '../models/mappers.js';
import { prisma } from '../models/prisma.js';
import type { AuthContext } from '../utils/auth-context.js';
import { forbidden, notFound } from '../utils/errors.js';
import { mergePayrollConfig } from './payroll/config.js';
import { lineView } from './payroll/runs.service.js';
import { getSettings } from './settings.service.js';

const num = (d: { toNumber(): number }) => d.toNumber();

/** Who the caller may read payslips for; `self` limits the view to paid runs. */
function access(auth: AuthContext, employeeId: string): { self: boolean } {
  if (auth.permissions.has('payroll.read')) return { self: false };
  if (auth.employeeId === employeeId && auth.permissions.has('payslip.self')) return { self: true };
  throw forbidden();
}

export async function list(auth: AuthContext, employeeId?: string) {
  const target = employeeId ?? auth.employeeId;
  if (!target) return [];
  const { self } = access(auth, target);
  const items = await prisma.payItem.findMany({
    where: { employeeId: target, run: self ? { status: 'paid' } : { status: { not: 'draft' } } },
    include: { run: true },
    orderBy: { run: { period: 'desc' } },
  });
  return items.map((i) => ({
    payRunId: i.payRunId,
    employeeId: i.employeeId,
    period: i.run.period,
    payDate: toDateString(i.run.payDate)!,
    paidAt: i.run.paidAt ? i.run.paidAt.toISOString() : null,
    gross: num(i.gross),
    totalDeductions: num(i.totalDeductions),
    net: num(i.net),
  }));
}

export async function get(auth: AuthContext, runId: string, employeeId: string) {
  const { self } = access(auth, employeeId);
  const item = await prisma.payItem.findUnique({
    where: { payRunId_employeeId: { payRunId: runId, employeeId } },
    include: {
      run: true,
      employee: {
        select: {
          id: true, employeeCode: true, firstName: true, lastName: true, departmentId: true, bankName: true, bankAccount: true,
          department: { select: { nameLo: true, nameEn: true } },
          position: { select: { nameLo: true, nameEn: true } },
        },
      },
    },
  });
  if (!item || (self && item.run.status !== 'paid')) throw notFound();
  const st = await getSettings();
  const cfg = mergePayrollConfig(item.run.configSnapshot ?? st.payrollConfig);
  const { run, ...rest } = item;
  return {
    ...lineView(rest),
    period: run.period,
    payDate: toDateString(run.payDate)!,
    status: run.status,
    /** False while HR has not confirmed the tax and social-security rates used (spec §11). */
    ratesConfirmed: !!cfg.confirmedAt,
    company: { nameLo: st.companyNameLo, nameEn: st.companyNameEn, addressLo: st.addressLo ?? '', addressEn: st.addressEn ?? '', taxId: st.taxId ?? '' },
    rates: {
      payDay: cfg.payDay,
      workDaysPerMonth: cfg.workDaysPerMonth,
      overtimeRate: cfg.overtime.weekdayRate,
      ssEmployeeRate: cfg.socialSecurity.employeeRate,
      ssEmployerRate: cfg.socialSecurity.employerRate,
      ssCeiling: cfg.socialSecurity.ceiling,
      taxBrackets: cfg.incomeTax.brackets,
    },
  };
}
