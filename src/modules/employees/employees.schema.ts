import { z } from 'zod';
import { optionalText, requiredText } from '../../lib/http.js';
import { listQuerySchema } from '../../lib/list-query.js';
import { passwordSchema } from '../../lib/password.js';
import { addDays } from '../../lib/dates.js';

export const SORTABLE = ['employeeCode', 'lastName', 'firstName', 'hireDate', 'createdAt'] as const;
export const STATUSES = ['active', 'probation', 'inactive', 'terminated'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'errors.validation.date').refine((v) => !Number.isNaN(Date.parse(v)), 'errors.validation.date');
const phone = z.string().trim().min(6, 'errors.validation.phone').max(20).regex(/^[0-9+\-\s()]+$/, 'errors.validation.phone');
const money = z.coerce.number().min(0, 'errors.validation.money').max(1e12).transform((v) => v.toFixed(2));

export const listEmployeesQuery = listQuerySchema(SORTABLE, 'employeeCode:asc').extend({
  departmentId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  status: z.enum(STATUSES).optional(),
});

const fields = {
  employeeCode: z.string().trim().min(1, 'errors.validation.required').max(30).regex(/^[A-Za-z0-9_-]+$/, 'errors.validation.code').transform((v) => v.toUpperCase()),
  firstName: requiredText(100),
  lastName: requiredText(100),
  gender: z.enum(['male', 'female', 'other']),
  dateOfBirth: isoDate,
  phone,
  email: z.string().trim().toLowerCase().email('errors.validation.email'),
  address: optionalText,
  departmentId: z.string().uuid('errors.validation.required'),
  positionId: z.string().uuid('errors.validation.required'),
  hireDate: isoDate,
  employmentStatus: z.enum(['active', 'probation']).optional(),
  basicSalary: money.optional(),
  emergencyContactName: optionalText,
  emergencyContactPhone: phone.nullish().or(z.literal('')).transform((v) => (v ? v : null)),
  emergencyContactRelation: optionalText,
  endDate: isoDate.nullish(),
};

const today = () => new Date().toISOString().slice(0, 10);
const ageAt = (dob: string, at: string) => {
  const [y1, m1, d1] = dob.split('-').map(Number);
  const [y2, m2, d2] = at.split('-').map(Number);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
};

function dateRules<T extends { dateOfBirth?: string; hireDate?: string }>(v: T, ctx: z.RefinementCtx) {
  if (v.hireDate && v.hireDate > addDays(today(), 90)) {
    ctx.addIssue({ code: 'custom', path: ['hireDate'], message: 'errors.employee.hireDateTooFar' });
  }
  if (v.dateOfBirth && v.hireDate && ageAt(v.dateOfBirth, v.hireDate) < 15) {
    ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'errors.employee.tooYoung' });
  }
}

export const accountSchema = z.object({
  email: z.string().trim().toLowerCase().email('errors.validation.email'),
  password: passwordSchema,
  roleCodes: z.array(z.string()).min(1, 'errors.validation.required'),
});

export const createEmployeeBody = z.object({ ...fields, account: accountSchema.optional() }).superRefine(dateRules);
export const updateEmployeeBody = z.object(fields).partial().superRefine(dateRules);
export const statusBody = z.object({ status: z.enum(STATUSES) });
