// Pay runs: create, adjust, recalculate, submit → approve → pay (spec §5.1, §5.3, §5.4).
import type { Prisma } from '../../generated/prisma/client.js';
import { fromDateString, toDateString } from '../../models/mappers.js';
import { prisma, withTx, type Db } from '../../models/prisma.js';
import type { AuthContext } from '../../utils/auth-context.js';
import { userIdsWithPermission } from '../../utils/auth-context.js';
import { audit } from '../../utils/audit.js';
import { addDays, localDate } from '../../utils/dates.js';
import { badRequest, conflict, fieldError, notFound } from '../../utils/errors.js';
import { lockRows } from '../../utils/lock.js';
import { notify, userIdOfEmployee } from '../notifications.service.js';
import { calculatePayItem, NegativeNetError, type PayAllowance, type PayInput, type PayResult } from './calc.js';
import { getPayrollConfig, mergePayrollConfig, type PayrollConfig } from './config.js';
import { buildInputs, periodBounds } from './inputs.js';

type Named = { nameLo: string; nameEn: string };
const MANUAL_ALLOWANCE: Omit<PayAllowance, 'amount'> = { typeId: 'manual', code: 'manual', nameLo: 'ເງິນອຸດໜູນ', nameEn: 'Allowance', taxable: true };

const num = (d: { toNumber(): number } | number | null | undefined) => (d == null ? 0 : typeof d === 'number' ? d : d.toNumber());
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

// ---------- calculation glue ----------

function resultColumns(r: PayResult) {
  return {
    basicEarned: r.basicEarned, allowanceTotal: r.allowanceTotal, overtimePay: r.overtimePay, unpaidDeduction: r.unpaidDeduction, gross: r.gross,
    ssBase: r.ssBase, ssEmployee: r.ssEmployee, ssEmployer: r.ssEmployer, taxable: r.taxable, incomeTax: r.incomeTax,
    totalDeductions: r.totalDeductions, net: r.net, employerCost: r.employerCost, result: r as unknown as Prisma.InputJsonValue,
  };
}

/** Runs the pure calculation; a negative net pay is reported against the field HR can change. */
function compute(input: PayInput, config: PayrollConfig): PayResult {
  try {
    return calculatePayItem(input, config);
  } catch (e) {
    if (e instanceof NegativeNetError) throw fieldError('otherDeduction', 'errors.payroll.negativeNet');
    throw e;
  }
}

interface ItemRow {
  basic: { toNumber(): number };
  periodWorkDays: number;
  paidWorkDays: number;
  allowances: unknown;
  overtimeMinutesWeekday: number;
  overtimeMinutesRestday: number;
  bonus: { toNumber(): number };
  otherDeduction: { toNumber(): number };
  unpaidDays: { toNumber(): number };
  manualFields: unknown;
}
const inputOf = (i: ItemRow): PayInput => ({
  basic: num(i.basic), periodWorkDays: i.periodWorkDays, paidWorkDays: i.paidWorkDays, allowances: (i.allowances as unknown as PayAllowance[]) ?? [],
  overtimeMinutesWeekday: i.overtimeMinutesWeekday, overtimeMinutesRestday: i.overtimeMinutesRestday,
  bonus: num(i.bonus), otherDeduction: num(i.otherDeduction), unpaidDays: num(i.unpaidDays),
});
const manualOf = (i: { manualFields: unknown }) => new Set<string>(Array.isArray(i.manualFields) ? (i.manualFields as string[]) : []);

// ---------- views ----------

const employeeSelect = {
  id: true, employeeCode: true, firstName: true, lastName: true, departmentId: true, bankName: true, bankAccount: true,
  department: { select: { nameLo: true, nameEn: true } }, position: { select: { nameLo: true, nameEn: true } },
} satisfies Prisma.EmployeeSelect;
type EmployeeBrief = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;
type ItemWithEmployee = Prisma.PayItemGetPayload<{ include: { employee: { select: typeof employeeSelect } } }>;

export const lineView = (i: ItemWithEmployee) => {
  const r = i.result as unknown as PayResult;
  const allowances = (i.allowances as unknown as PayAllowance[]) ?? [];
  return {
    employeeId: i.employeeId,
    employee: { ...i.employee },
    item: {
      employeeId: i.employeeId,
      basic: num(i.basic),
      allowance: allowances.reduce((s, a) => s + a.amount, 0),
      overtimeMinutes: i.overtimeMinutesWeekday + i.overtimeMinutesRestday,
      bonus: num(i.bonus),
      otherDeduction: num(i.otherDeduction),
      unpaidDays: num(i.unpaidDays),
      note: i.note,
    },
    calc: {
      basic: r.basicEarned, allowance: r.allowanceTotal, overtimeHours: r.overtimeHoursWeekday + r.overtimeHoursRestday, overtimePay: r.overtimePay,
      bonus: num(i.bonus), unpaidDays: num(i.unpaidDays), unpaidDeduction: r.unpaidDeduction, gross: r.gross, ssBase: r.ssBase, ssEmployee: r.ssEmployee,
      ssEmployer: r.ssEmployer, taxable: r.taxable, incomeTax: r.incomeTax, otherDeduction: num(i.otherDeduction), totalDeductions: r.totalDeductions,
      net: r.net, employerCost: r.employerCost, taxSteps: r.taxSteps,
    },
  };
};

const runInclude = { approvedBy: { select: { email: true } }, items: { select: { gross: true, net: true, incomeTax: true, ssEmployee: true, ssEmployer: true, employerCost: true } } } satisfies Prisma.PayRunInclude;
type RunWithTotals = Prisma.PayRunGetPayload<{ include: typeof runInclude }>;

export function summaryView(r: RunWithTotals) {
  const sum = (k: 'gross' | 'net' | 'incomeTax' | 'ssEmployee' | 'ssEmployer' | 'employerCost') => r.items.reduce((s, i) => s + num(i[k]), 0);
  return {
    id: r.id, period: r.period, status: r.status, payDate: toDateString(r.payDate)!, employeeCount: r.items.length,
    totalGross: sum('gross'), totalNet: sum('net'), totalTax: sum('incomeTax'), totalSsEmployee: sum('ssEmployee'), totalSsEmployer: sum('ssEmployer'), totalEmployerCost: sum('employerCost'),
    createdAt: r.createdAt.toISOString(), submittedAt: isoOrNull(r.submittedAt), approvedAt: isoOrNull(r.approvedAt), approvedBy: r.approvedBy, paidAt: isoOrNull(r.paidAt),
  };
}

// ---------- queries ----------

export async function list(year?: number) {
  const runs = await prisma.payRun.findMany({
    where: year ? { period: { startsWith: `${year}-` } } : undefined,
    orderBy: { period: 'desc' },
    include: runInclude,
  });
  return runs.map(summaryView);
}

export async function get(auth: AuthContext, id: string) {
  const run = await prisma.payRun.findUnique({ where: { id }, include: runInclude });
  if (!run) throw notFound();
  const items = await prisma.payItem.findMany({ where: { payRunId: id }, include: { employee: { select: employeeSelect } } });

  // The latest earlier run that has left draft, for the "what changed" comparison (spec §5.4).
  const prevRun = await prisma.payRun.findFirst({ where: { period: { lt: run.period }, status: { not: 'draft' } }, orderBy: { period: 'desc' }, include: runInclude });
  const prevItems = prevRun ? await prisma.payItem.findMany({ where: { payRunId: prevRun.id }, include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } } } }) : [];
  const prevNet = new Map(prevItems.map((p) => [p.employeeId, num(p.net)]));
  const here = new Set(items.map((i) => i.employeeId));

  const summary = summaryView(run);
  // A submitted run keeps the rules it was calculated with; a draft follows the current ones.
  const rules = run.configSnapshot ? mergePayrollConfig(run.configSnapshot) : await getPayrollConfig();
  const manage = auth.permissions.has('payroll.manage');
  const lines = items
    .map((i) => ({ ...lineView(i), previousNet: prevNet.get(i.employeeId) ?? null }))
    .sort((a, b) => a.employee.employeeCode.localeCompare(b.employee.employeeCode));
  return {
    ...summary,
    lines,
    previous: prevRun
      ? (({ id: pid, period, employeeCount, totalGross, totalNet, totalEmployerCost, totalTax, totalSsEmployee }) => ({ id: pid, period, employeeCount, totalGross, totalNet, totalEmployerCost, totalTax, totalSsEmployee }))(summaryView(prevRun))
      : null,
    leavers: prevItems
      .filter((p) => !here.has(p.employeeId))
      .map((p) => ({ id: p.employee.id, employeeCode: p.employee.employeeCode, firstName: p.employee.firstName, lastName: p.employee.lastName, previousNet: num(p.net) })),
    ratesConfirmed: !!rules.confirmedAt,
    canEdit: manage && run.status === 'draft',
    canSubmit: manage && run.status === 'draft' && items.length > 0,
    canApprove: auth.permissions.has('payroll.approve') && run.status === 'pending' && run.submittedById !== auth.userId,
    canPay: manage && run.status === 'approved',
  };
}

// ---------- create / recalculate ----------

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

function payDateOf(period: string, payDay: number): string {
  const { end } = periodBounds(period);
  const last = Number(end.slice(8, 10));
  return `${period}-${String(Math.min(payDay, last)).padStart(2, '0')}`;
}

export async function create(auth: AuthContext, period: string, ip?: string) {
  if (!PERIOD.test(period)) throw fieldError('period', 'errors.validation.period');
  const thisMonth = localDate(new Date()).slice(0, 7);
  const nextMonth = periodBounds(thisMonth).end;
  if (period > addDays(nextMonth, 1).slice(0, 7)) throw fieldError('period', 'errors.payroll.futurePeriod');
  if (await prisma.payRun.findUnique({ where: { period } })) throw fieldError('period', 'errors.payroll.periodExists');

  const config = await getPayrollConfig();
  const id = await withTx(async (tx) => {
    const inputs = await buildInputs(tx, period);
    if (!inputs.size) throw fieldError('period', 'errors.payroll.noEmployees');
    const run = await tx.payRun.create({ data: { period, status: 'draft', payDate: fromDateString(payDateOf(period, config.payDay)), createdById: auth.userId } });
    for (const [employeeId, p] of inputs) {
      const input: PayInput = { ...p, bonus: 0, otherDeduction: 0 };
      await tx.payItem.create({
        data: {
          payRunId: run.id, employeeId, basic: p.basic, periodWorkDays: p.periodWorkDays, paidWorkDays: p.paidWorkDays, allowances: p.allowances as unknown as Prisma.InputJsonValue,
          overtimeMinutesWeekday: p.overtimeMinutesWeekday, overtimeMinutesRestday: p.overtimeMinutesRestday, unpaidDays: p.unpaidDays, bonus: 0, otherDeduction: 0,
          manualFields: [], ...resultColumns(compute(input, config)),
        },
      });
    }
    await tx.payRunEvent.create({ data: { payRunId: run.id, action: 'created', actorId: auth.userId } });
    await audit(tx, auth, { action: 'payroll.create', entity: 'pay_run', entityId: run.id, after: { period, employees: inputs.size }, ip });
    return run.id;
  });
  return summaryOf(id);
}

const summaryOf = async (id: string) => summaryView((await prisma.payRun.findUniqueOrThrow({ where: { id }, include: runInclude })));

/** Draft only: locks the run and returns it, or explains why it cannot be edited. */
async function lockDraft(tx: Prisma.TransactionClient, id: string, state: 'draft' | 'pending' | 'approved' = 'draft') {
  if (!(await lockRows(tx, 'pay_runs', [id])).length) throw notFound();
  const run = await tx.payRun.findUniqueOrThrow({ where: { id } });
  if (run.status !== state) throw conflict(state === 'draft' ? 'errors.payroll.notDraft' : state === 'pending' ? 'errors.payroll.notPending' : 'errors.payroll.notApproved');
  return run;
}

/** Rebuilds period inputs for every employee in the run. Hand-edited fields, bonus and other deductions are kept. */
async function recalculateAll(tx: Prisma.TransactionClient, runId: string, period: string, config: PayrollConfig) {
  const inputs = await buildInputs(tx, period);
  const existing = await tx.payItem.findMany({ where: { payRunId: runId } });
  const byEmp = new Map(existing.map((i) => [i.employeeId, i]));

  const stale = existing.filter((i) => !inputs.has(i.employeeId)).map((i) => i.id);
  if (stale.length) await tx.payItem.deleteMany({ where: { id: { in: stale } } });

  for (const [employeeId, p] of inputs) {
    const cur = byEmp.get(employeeId);
    const manual = cur ? manualOf(cur) : new Set<string>();
    const merged: PayInput = {
      ...p,
      allowances: manual.has('allowance') && cur ? ((cur.allowances as unknown as PayAllowance[]) ?? []) : p.allowances,
      overtimeMinutesWeekday: manual.has('overtime') && cur ? cur.overtimeMinutesWeekday : p.overtimeMinutesWeekday,
      overtimeMinutesRestday: manual.has('overtime') && cur ? cur.overtimeMinutesRestday : p.overtimeMinutesRestday,
      unpaidDays: manual.has('unpaidDays') && cur ? num(cur.unpaidDays) : p.unpaidDays,
      bonus: cur ? num(cur.bonus) : 0,
      otherDeduction: cur ? num(cur.otherDeduction) : 0,
    };
    const data = {
      basic: p.basic, periodWorkDays: p.periodWorkDays, paidWorkDays: p.paidWorkDays, allowances: merged.allowances as unknown as Prisma.InputJsonValue,
      overtimeMinutesWeekday: merged.overtimeMinutesWeekday, overtimeMinutesRestday: merged.overtimeMinutesRestday, unpaidDays: merged.unpaidDays,
      ...resultColumns(compute(merged, config)),
    };
    if (cur) await tx.payItem.update({ where: { id: cur.id }, data });
    else await tx.payItem.create({ data: { payRunId: runId, employeeId, bonus: 0, otherDeduction: 0, manualFields: [], ...data } });
  }
  return inputs.size;
}

export async function recalculate(auth: AuthContext, id: string, ip?: string) {
  const config = await getPayrollConfig();
  await withTx(async (tx) => {
    const run = await lockDraft(tx, id);
    const n = await recalculateAll(tx, id, run.period, config);
    await tx.payRunEvent.create({ data: { payRunId: id, action: 'recalculated', actorId: auth.userId } });
    await audit(tx, auth, { action: 'payroll.recalculate', entity: 'pay_run', entityId: id, after: { employees: n }, ip });
  });
  return get(auth, id);
}

export interface ItemBody { allowance: number; bonus: number; overtimeMinutes: number; unpaidDays: number; otherDeduction: number; note: string | null }

export async function updateItem(auth: AuthContext, id: string, employeeId: string, body: ItemBody, ip?: string) {
  const config = await getPayrollConfig();
  await withTx(async (tx) => {
    await lockDraft(tx, id);
    const item = await tx.payItem.findUnique({ where: { payRunId_employeeId: { payRunId: id, employeeId } } });
    if (!item) throw notFound();
    const manual = manualOf(item);

    let allowances = (item.allowances as unknown as PayAllowance[]) ?? [];
    if (body.allowance !== allowances.reduce((s, a) => s + a.amount, 0)) {
      allowances = body.allowance > 0 ? [{ ...MANUAL_ALLOWANCE, amount: body.allowance }] : [];
      manual.add('allowance');
    }
    let wd = item.overtimeMinutesWeekday;
    let rd = item.overtimeMinutesRestday;
    if (body.overtimeMinutes !== wd + rd) {
      wd = body.overtimeMinutes;
      rd = 0;
      manual.add('overtime');
    }
    if (body.unpaidDays !== num(item.unpaidDays)) manual.add('unpaidDays');

    const input: PayInput = { ...inputOf(item), allowances, overtimeMinutesWeekday: wd, overtimeMinutesRestday: rd, unpaidDays: body.unpaidDays, bonus: body.bonus, otherDeduction: body.otherDeduction };
    await tx.payItem.update({
      where: { id: item.id },
      data: {
        allowances: allowances as unknown as Prisma.InputJsonValue, overtimeMinutesWeekday: wd, overtimeMinutesRestday: rd, unpaidDays: body.unpaidDays,
        bonus: body.bonus, otherDeduction: body.otherDeduction, note: body.note, manualFields: [...manual], ...resultColumns(compute(input, config)),
      },
    });
    await audit(tx, auth, { action: 'payroll.item', entity: 'pay_run', entityId: id, after: { employeeId, ...body }, ip });
  });
  const item = await prisma.payItem.findUniqueOrThrow({ where: { payRunId_employeeId: { payRunId: id, employeeId } }, include: { employee: { select: employeeSelect } } });
  return lineView(item);
}

export async function remove(auth: AuthContext, id: string, ip?: string) {
  await withTx(async (tx) => {
    const run = await lockDraft(tx, id);
    await tx.payRun.delete({ where: { id } });
    await audit(tx, auth, { action: 'payroll.delete', entity: 'pay_run', entityId: id, before: { period: run.period }, ip });
  });
}

// ---------- status changes ----------

export async function submit(auth: AuthContext, id: string, ip?: string) {
  const config = await getPayrollConfig();
  await withTx(async (tx) => {
    const run = await lockDraft(tx, id);
    const n = await recalculateAll(tx, id, run.period, config);
    if (n === 0) throw badRequest('errors.payroll.noEmployees');
    await tx.payRun.update({ where: { id }, data: { status: 'pending', configSnapshot: config as unknown as Prisma.InputJsonValue, submittedById: auth.userId, submittedAt: new Date(), lastReturnNote: null } });
    await tx.payRunEvent.create({ data: { payRunId: id, action: 'submitted', actorId: auth.userId } });
    const approvers = (await userIdsWithPermission('payroll.approve')).filter((u) => u !== auth.userId);
    await notify(tx, approvers, 'payroll.submitted', 'notifications.payrollSubmitted', { runId: id, period: run.period });
    await audit(tx, auth, { action: 'payroll.submit', entity: 'pay_run', entityId: id, ip });
  });
  return get(auth, id);
}

export async function reject(auth: AuthContext, id: string, note: string, ip?: string) {
  await withTx(async (tx) => {
    const run = await lockDraft(tx, id, 'pending');
    await tx.payRun.update({ where: { id }, data: { status: 'draft', submittedById: null, submittedAt: null, lastReturnNote: note } });
    await tx.payRunEvent.create({ data: { payRunId: id, action: 'returned', actorId: auth.userId, note } });
    if (run.submittedById) await notify(tx, run.submittedById, 'payroll.returned', 'notifications.payrollReturned', { runId: id, period: run.period, note });
    await audit(tx, auth, { action: 'payroll.return', entity: 'pay_run', entityId: id, after: { note }, ip });
  });
  return get(auth, id);
}

export async function approve(auth: AuthContext, id: string, ip?: string) {
  await withTx(async (tx) => {
    const run = await lockDraft(tx, id, 'pending');
    if (run.submittedById === auth.userId) throw conflict('errors.payroll.selfApprove');
    await tx.payRun.update({ where: { id }, data: { status: 'approved', approvedById: auth.userId, approvedAt: new Date() } });
    await tx.payRunEvent.create({ data: { payRunId: id, action: 'approved', actorId: auth.userId } });
    const hr = (await userIdsWithPermission('payroll.manage')).filter((u) => u !== auth.userId);
    await notify(tx, hr, 'payroll.approved', 'notifications.payrollApproved', { runId: id, period: run.period });
    await audit(tx, auth, { action: 'payroll.approve', entity: 'pay_run', entityId: id, ip });
  });
  return get(auth, id);
}

export async function pay(auth: AuthContext, id: string, ip?: string) {
  await withTx(async (tx) => {
    const run = await lockDraft(tx, id, 'approved');
    await tx.payRun.update({ where: { id }, data: { status: 'paid', paidById: auth.userId, paidAt: new Date() } });
    await tx.payRunEvent.create({ data: { payRunId: id, action: 'paid', actorId: auth.userId } });
    const items = await tx.payItem.findMany({ where: { payRunId: id }, select: { employeeId: true } });
    const users = await Promise.all(items.map((i) => userIdOfEmployee(tx, i.employeeId)));
    await notify(tx, users.filter((u): u is string => !!u), 'payslip.ready', 'notifications.payslipReady', { runId: id, period: run.period });
    await audit(tx, auth, { action: 'payroll.pay', entity: 'pay_run', entityId: id, ip });
  });
  return get(auth, id);
}

// ---------- bank transfer file (spec §5.5) ----------

const csvCell = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function exportBankCsv(id: string, lang: 'lo' | 'en') {
  const run = await prisma.payRun.findUnique({ where: { id } });
  if (!run) throw notFound();
  if (run.status !== 'approved' && run.status !== 'paid') throw conflict('errors.payroll.notApproved');
  const items = await prisma.payItem.findMany({ where: { payRunId: id }, include: { employee: { select: employeeSelect } } });
  items.sort((a, b) => a.employee.employeeCode.localeCompare(b.employee.employeeCode));
  const head = lang === 'en' ? ['Code', 'Name', 'Bank', 'Account', 'Net pay'] : ['ລະຫັດ', 'ຊື່', 'ທະນາຄານ', 'ເລກບັນຊີ', 'ຮັບສຸດທິ'];
  const rows = items.map((i: ItemWithEmployee) => [i.employee.employeeCode, `${i.employee.firstName} ${i.employee.lastName}`, i.employee.bankName, i.employee.bankAccount, num(i.net)]);
  const missing = items.filter((i) => !i.employee.bankAccount).length;
  const csv = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  return { csv, missing, period: run.period };
}

export type { EmployeeBrief, Named };
