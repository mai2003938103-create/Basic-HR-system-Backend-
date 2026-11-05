// Final review finding 1: under MySQL's default REPEATABLE READ, a row locked with SELECT … FOR UPDATE and then
// re-read with a plain SELECT showed the transaction's old snapshot (lost updates, over-approval, crashes).
import { withTx } from '../../src/models/prisma.js';
import { refundUsed } from '../../src/models/leave.model.js';
import { getOrCreateBalance } from '../../src/services/leave.service.js';
import { prisma, resetDb } from '../helpers/db.js';
import { createEmployee } from '../helpers/factory.js';

const annual = () => prisma.leaveType.findUniqueOrThrow({ where: { code: 'ANNUAL' } });

describe('row locks see the latest committed data', () => {
  beforeEach(resetDb);

  it('reads a locked balance as committed by another request after the transaction began', async () => {
    const e = await createEmployee();
    const lt = await annual();
    const b = await prisma.leaveBalance.create({ data: { employeeId: e.id, leaveTypeId: lt.id, year: 2026, entitledDays: '15', usedDays: '3' } });
    await withTx(async (tx) => {
      await tx.leaveBalance.findMany({ where: { employeeId: e.id } }); // the transaction's first read
      await prisma.leaveBalance.update({ where: { id: b.id }, data: { usedDays: '5' } }); // another request commits
      expect((await getOrCreateBalance(tx, e.id, lt.id, 2026, true)).usedDays).toBe(5);
    });
  });

  it('finds a balance row another request created after the transaction began (no crash)', async () => {
    const e = await createEmployee();
    const lt = await annual();
    await withTx(async (tx) => {
      await tx.leaveBalance.findMany({ where: { employeeId: e.id } });
      await prisma.leaveBalance.create({ data: { employeeId: e.id, leaveTypeId: lt.id, year: 2026, entitledDays: '15', usedDays: '2' } });
      expect((await getOrCreateBalance(tx, e.id, lt.id, 2026, true)).usedDays).toBe(2);
    });
  });

  it('refunds from the latest used days, never below zero', async () => {
    const e = await createEmployee();
    const lt = await annual();
    const b = await prisma.leaveBalance.create({ data: { employeeId: e.id, leaveTypeId: lt.id, year: 2026, entitledDays: '15', usedDays: '3' } });
    await withTx(async (tx) => {
      await tx.leaveBalance.findUnique({ where: { id: b.id } }); // snapshot sees 3
      await prisma.leaveBalance.update({ where: { id: b.id }, data: { usedDays: '5' } }); // an approval adds 2
      await refundUsed(b.id, 1, tx);
    });
    expect((await prisma.leaveBalance.findUniqueOrThrow({ where: { id: b.id } })).usedDays.toNumber()).toBe(4);
    await refundUsed(b.id, 10);
    expect((await prisma.leaveBalance.findUniqueOrThrow({ where: { id: b.id } })).usedDays.toNumber()).toBe(0);
  });
});
