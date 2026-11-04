import type { z } from 'zod';
import * as holidays from '../models/holiday.model.js';
import * as leaveTypes from '../models/leave-type.model.js';
import { prisma } from '../models/prisma.js';
import type { AuthContext } from '../utils/auth-context.js';
import { audit } from '../utils/audit.js';
import { notFound } from '../utils/errors.js';
import type { holidayBody, leaveTypeBody } from '../validators/calendar.validator.js';
import { leaveTypeView } from '../views/leave-type.view.js';

export const listHolidays = (year: number) => holidays.listYear(year);

export async function addHoliday(auth: AuthContext, body: z.infer<typeof holidayBody>) {
  const h = await holidays.create(body);
  await audit(prisma, auth, { action: 'holiday.create', entity: 'holiday', entityId: h.id, after: h });
  return h;
}

export async function removeHoliday(auth: AuthContext, id: string) {
  const h = await holidays.findById(id);
  if (!h) throw notFound();
  await holidays.remove(id);
  await audit(prisma, auth, { action: 'holiday.delete', entity: 'holiday', entityId: h.id, before: h });
}

export const listLeaveTypes = async () => (await leaveTypes.list()).map(leaveTypeView);

export async function createLeaveType(auth: AuthContext, body: z.infer<typeof leaveTypeBody>) {
  const t = await leaveTypes.create(body);
  await audit(prisma, auth, { action: 'leaveType.create', entity: 'leave_type', entityId: t.id, after: t });
  return leaveTypeView(t);
}

export async function updateLeaveType(auth: AuthContext, id: string, body: Partial<z.infer<typeof leaveTypeBody>>) {
  if (!(await leaveTypes.findById(id))) throw notFound();
  const t = await leaveTypes.update(id, body);
  await audit(prisma, auth, { action: 'leaveType.update', entity: 'leave_type', entityId: t.id, after: t });
  return leaveTypeView(t);
}
