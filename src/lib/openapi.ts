import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z, type ZodTypeAny } from 'zod';
import { idParams } from './http.js';
import { changePasswordSchema, loginSchema, resetPasswordSchema } from '../modules/auth/auth.schema.js';
import { createDepartmentBody, listDepartmentsQuery, updateDepartmentBody } from '../modules/departments/departments.schema.js';
import { createPositionBody, listPositionsQuery, updatePositionBody } from '../modules/positions/positions.schema.js';
import { createEmployeeBody, listEmployeesQuery, statusBody, updateEmployeeBody } from '../modules/employees/employees.schema.js';
import { createUserBody, listUsersQuery, updateUserBody, userStatusBody } from '../modules/users/users.schema.js';
import { editAttendanceBody, exportAttendanceQuery, listAttendanceQuery } from '../modules/attendance/attendance.schema.js';
import { approveBody, balanceUpdateBody, balancesQuery, createLeaveBody, listLeaveQuery, rejectBody } from '../modules/leave/leave.schema.js';

extendZodWithOpenApi(z);

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface Op {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  permission?: string;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
  multipart?: Record<string, 'string' | 'binary'>;
  status?: number;
  public?: boolean;
}

const roleBody = z.object({ code: z.string(), nameLo: z.string(), nameEn: z.string(), scope: z.enum(['all', 'department', 'self']), permissionCodes: z.array(z.string()) });
const holidayBody = z.object({ date: z.string(), nameLo: z.string(), nameEn: z.string() });
const leaveTypeBody = z.object({ code: z.string(), nameLo: z.string(), nameEn: z.string(), defaultDaysPerYear: z.number(), isPaid: z.boolean().optional(), documentRequiredAfterDays: z.number().nullish(), isActive: z.boolean().optional() });

const OPS: Op[] = [
  { method: 'post', path: '/api/auth/login', tag: 'Auth', summary: 'Sign in; sets the hrms_rt refresh cookie', body: loginSchema, public: true },
  { method: 'post', path: '/api/auth/refresh', tag: 'Auth', summary: 'Rotate the refresh cookie and get a new access token', public: true },
  { method: 'post', path: '/api/auth/logout', tag: 'Auth', summary: 'Revoke the refresh cookie', status: 204, public: true },
  { method: 'get', path: '/api/auth/me', tag: 'Auth', summary: 'Current user, roles and permissions' },
  { method: 'put', path: '/api/auth/password', tag: 'Auth', summary: 'Change own password', body: changePasswordSchema, status: 204 },
  { method: 'post', path: '/api/auth/reset-password', tag: 'Auth', summary: 'Set a new password with a reset token', body: resetPasswordSchema, status: 204, public: true },

  { method: 'get', path: '/api/departments', tag: 'Departments', summary: 'List departments', permission: 'department.read', query: listDepartmentsQuery },
  { method: 'post', path: '/api/departments', tag: 'Departments', summary: 'Create a department', permission: 'department.manage', body: createDepartmentBody, status: 201 },
  { method: 'get', path: '/api/departments/:id', tag: 'Departments', summary: 'Department detail', permission: 'department.read' },
  { method: 'put', path: '/api/departments/:id', tag: 'Departments', summary: 'Update a department', permission: 'department.manage', body: updateDepartmentBody },
  { method: 'delete', path: '/api/departments/:id', tag: 'Departments', summary: 'Delete an unused department', permission: 'department.manage', status: 204 },

  { method: 'get', path: '/api/positions', tag: 'Positions', summary: 'List positions', permission: 'position.read', query: listPositionsQuery },
  { method: 'post', path: '/api/positions', tag: 'Positions', summary: 'Create a position', permission: 'position.manage', body: createPositionBody, status: 201 },
  { method: 'get', path: '/api/positions/:id', tag: 'Positions', summary: 'Position detail', permission: 'position.read' },
  { method: 'put', path: '/api/positions/:id', tag: 'Positions', summary: 'Update a position', permission: 'position.manage', body: updatePositionBody },
  { method: 'delete', path: '/api/positions/:id', tag: 'Positions', summary: 'Delete an unused position', permission: 'position.manage', status: 204 },

  { method: 'get', path: '/api/files/:folder/:name', tag: 'Files', summary: 'Download an uploaded photo or (authorized) document' },

  { method: 'get', path: '/api/employees', tag: 'Employees', summary: 'List employees in scope', permission: 'employee.read', query: listEmployeesQuery },
  { method: 'post', path: '/api/employees', tag: 'Employees', summary: 'Create an employee (optionally with a login account)', permission: 'employee.create', body: createEmployeeBody, status: 201 },
  { method: 'get', path: '/api/employees/:id', tag: 'Employees', summary: 'Employee detail', permission: 'employee.read' },
  { method: 'put', path: '/api/employees/:id', tag: 'Employees', summary: 'Update an employee', permission: 'employee.update', body: updateEmployeeBody },
  { method: 'delete', path: '/api/employees/:id', tag: 'Employees', summary: 'Deactivate an employee (soft delete)', permission: 'employee.delete', status: 204 },
  { method: 'patch', path: '/api/employees/:id/status', tag: 'Employees', summary: 'Change employment status', permission: 'employee.update', body: statusBody },
  { method: 'post', path: '/api/employees/:id/photo', tag: 'Employees', summary: 'Upload a profile photo', permission: 'employee.update', multipart: { photo: 'binary' } },

  { method: 'get', path: '/api/users', tag: 'Users', summary: 'List users', permission: 'user.read', query: listUsersQuery },
  { method: 'post', path: '/api/users', tag: 'Users', summary: 'Create a user', permission: 'user.manage', body: createUserBody, status: 201 },
  { method: 'get', path: '/api/users/:id', tag: 'Users', summary: 'User detail', permission: 'user.read' },
  { method: 'put', path: '/api/users/:id', tag: 'Users', summary: 'Update email, roles or linked employee', permission: 'user.manage', body: updateUserBody },
  { method: 'patch', path: '/api/users/:id/status', tag: 'Users', summary: 'Activate or deactivate a user', permission: 'user.manage', body: userStatusBody },
  { method: 'post', path: '/api/users/:id/reset-link', tag: 'Users', summary: 'Create a one-time password reset link (1 hour)', permission: 'user.manage' },
  { method: 'get', path: '/api/roles', tag: 'Roles', summary: 'List roles with permissions', permission: 'role.manage' },
  { method: 'post', path: '/api/roles', tag: 'Roles', summary: 'Create a role', permission: 'role.manage', body: roleBody, status: 201 },
  { method: 'put', path: '/api/roles/:id', tag: 'Roles', summary: 'Update a role (super_admin is locked)', permission: 'role.manage', body: roleBody.omit({ code: true }).partial() },
  { method: 'get', path: '/api/permissions', tag: 'Roles', summary: 'List all permissions', permission: 'role.manage' },

  { method: 'get', path: '/api/settings/public', tag: 'Settings', summary: 'Company name, currency and working hours' },
  { method: 'get', path: '/api/holidays', tag: 'Calendar', summary: 'Public holidays of a year', permission: 'leave.read', query: z.object({ year: z.number().optional() }) },
  { method: 'post', path: '/api/holidays', tag: 'Calendar', summary: 'Add a public holiday', permission: 'leave.manage', body: holidayBody, status: 201 },
  { method: 'delete', path: '/api/holidays/:id', tag: 'Calendar', summary: 'Remove a public holiday', permission: 'leave.manage', status: 204 },
  { method: 'get', path: '/api/leave-types', tag: 'Calendar', summary: 'List leave types', permission: 'leave.read' },
  { method: 'post', path: '/api/leave-types', tag: 'Calendar', summary: 'Create a leave type', permission: 'leave.manage', body: leaveTypeBody, status: 201 },
  { method: 'put', path: '/api/leave-types/:id', tag: 'Calendar', summary: 'Update a leave type', permission: 'leave.manage', body: leaveTypeBody.partial() },

  { method: 'get', path: '/api/attendance', tag: 'Attendance', summary: 'Attendance records in scope', permission: 'attendance.read', query: listAttendanceQuery },
  { method: 'get', path: '/api/attendance/today', tag: 'Attendance', summary: "Caller's record for today", permission: 'attendance.check' },
  { method: 'get', path: '/api/attendance/export', tag: 'Attendance', summary: 'CSV export (UTF-8 with BOM)', permission: 'attendance.read', query: exportAttendanceQuery },
  { method: 'post', path: '/api/attendance/check-in', tag: 'Attendance', summary: 'Check in now (server time)', permission: 'attendance.check', status: 201 },
  { method: 'post', path: '/api/attendance/check-out', tag: 'Attendance', summary: 'Check out now (server time)', permission: 'attendance.check' },
  { method: 'put', path: '/api/attendance/:id', tag: 'Attendance', summary: 'Correct a record (note required)', permission: 'attendance.manage', body: editAttendanceBody },

  { method: 'get', path: '/api/leave-requests', tag: 'Leave', summary: 'Leave requests in scope (mine / toApprove filters)', permission: 'leave.read', query: listLeaveQuery },
  { method: 'post', path: '/api/leave-requests', tag: 'Leave', summary: 'Submit a leave request (multipart, optional document)', permission: 'leave.request', multipart: { leaveTypeId: 'string', startDate: 'string', endDate: 'string', halfDay: 'string', reason: 'string', document: 'binary' }, status: 201 },
  { method: 'get', path: '/api/leave-requests/:id', tag: 'Leave', summary: 'Leave request detail', permission: 'leave.read' },
  { method: 'put', path: '/api/leave-requests/:id/approve', tag: 'Leave', summary: 'Approve a pending request', permission: 'leave.approve', body: approveBody },
  { method: 'put', path: '/api/leave-requests/:id/reject', tag: 'Leave', summary: 'Reject a pending request (note required)', permission: 'leave.approve', body: rejectBody },
  { method: 'put', path: '/api/leave-requests/:id/cancel', tag: 'Leave', summary: 'Cancel own pending/future request', permission: 'leave.read' },
  { method: 'get', path: '/api/leave-balances', tag: 'Leave', summary: 'Leave balances per type for a year', permission: 'leave.read', query: balancesQuery },
  { method: 'put', path: '/api/leave-balances/:id', tag: 'Leave', summary: 'Adjust entitlement', permission: 'leave.manage', body: balanceUpdateBody },

  { method: 'get', path: '/api/notifications', tag: 'Notifications', summary: 'My notifications', query: z.object({ unread: z.enum(['true', 'false']).optional() }) },
  { method: 'put', path: '/api/notifications/read-all', tag: 'Notifications', summary: 'Mark all as read', status: 204 },
  { method: 'put', path: '/api/notifications/:id/read', tag: 'Notifications', summary: 'Mark one as read' },
  { method: 'get', path: '/api/dashboard/summary', tag: 'Dashboard', summary: 'Headline numbers in scope', permission: 'dashboard.view' },
  { method: 'get', path: '/api/dashboard/charts', tag: 'Dashboard', summary: 'Chart series in scope', permission: 'dashboard.view' },
];

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.array(z.object({ field: z.string(), message: z.string() })).optional() }) });

/** Strips refinements/effects so the generator sees the plain object shape. */
function plain(s: ZodTypeAny): ZodTypeAny {
  let cur: any = s;
  while (cur?._def?.schema) cur = cur._def.schema;
  return cur;
}

export function buildOpenApi() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearer', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  for (const op of OPS) {
    const params = [...op.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
    const status = op.status ?? 200;
    registry.registerPath({
      method: op.method,
      path: op.path.replace(/:(\w+)/g, '{$1}'),
      tags: [op.tag],
      summary: op.summary,
      description: op.permission ? `Requires permission \`${op.permission}\`.` : undefined,
      security: op.public ? [] : [{ bearer: [] }],
      request: {
        ...(params.length ? { params: params.length === 1 && params[0] === 'id' ? idParams : z.object(Object.fromEntries(params.map((p) => [p, z.string()]))) } : {}),
        ...(op.query ? { query: plain(op.query) as any } : {}),
        ...(op.body ? { body: { content: { 'application/json': { schema: plain(op.body) } } } } : {}),
        ...(op.multipart
          ? {
              body: {
                content: {
                  'multipart/form-data': {
                    schema: z.object(Object.fromEntries(Object.entries(op.multipart).map(([k, t]) => [k, t === 'binary' ? z.any().openapi({ type: 'string', format: 'binary' }) : z.string()]))),
                  },
                },
              },
            }
          : {}),
      },
      responses: {
        [status]: { description: status === 204 ? 'No content' : 'OK' },
        400: { description: 'Validation error', content: { 'application/json': { schema: errorSchema } } },
        ...(op.public ? {} : { 401: { description: 'Not signed in', content: { 'application/json': { schema: errorSchema } } } }),
        ...(op.permission ? { 403: { description: 'Missing permission', content: { 'application/json': { schema: errorSchema } } } } : {}),
      },
    });
  }
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: { title: 'Systory HRMS API', version: '1.0.0', description: 'Stage 1 API. Lists return { data, meta }; errors return { error: { code, message, details? } } where message is an i18n key.' },
    servers: [{ url: 'http://localhost:4000' }],
  });
}
