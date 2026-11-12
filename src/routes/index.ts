// Every API router and its OpenAPI entries, in mount order.
import type { Router } from 'express';
import type { Op } from '../utils/openapi.js';
import { allowanceDocs, allowanceTypeRoutes } from './allowances.routes.js';
import { attendanceDocs, attendanceRoutes } from './attendance.routes.js';
import { authDocs, authRoutes } from './auth.routes.js';
import { dashboardDocs, dashboardRoutes } from './dashboard.routes.js';
import { notificationDocs, notificationRoutes } from './notifications.routes.js';
import { calendarDocs, holidayRoutes, leaveTypeRoutes } from './calendar.routes.js';
import { leaveBalanceRoutes, leaveDocs, leaveRoutes } from './leave.routes.js';
import { settingsDocs, settingsRoutes } from './settings.routes.js';
import { departmentDocs, departmentRoutes } from './departments.routes.js';
import { employeeDocs, employeeRoutes } from './employees.routes.js';
import { fileDocs, fileRoutes } from './files.routes.js';
import { payrollDocs, payrollRoutes, payslipRoutes } from './payroll.routes.js';
import { reportDocs, reportRoutes } from './reports.routes.js';
import { positionDocs, positionRoutes } from './positions.routes.js';
import { permissionRoutes, roleDocs, roleRoutes } from './roles.routes.js';
import { userDocs, userRoutes } from './users.routes.js';

export const MOUNTS: [string, () => Router][] = [
  ['/api/auth', authRoutes],
  ['/api/departments', departmentRoutes],
  ['/api/positions', positionRoutes],
  ['/api/files', fileRoutes],
  ['/api/employees', employeeRoutes],
  ['/api/users', userRoutes],
  ['/api/roles', roleRoutes],
  ['/api/permissions', permissionRoutes],
  ['/api/settings', settingsRoutes],
  ['/api/holidays', holidayRoutes],
  ['/api/leave-types', leaveTypeRoutes],
  ['/api/attendance', attendanceRoutes],
  ['/api/leave-requests', leaveRoutes],
  ['/api/leave-balances', leaveBalanceRoutes],
  ['/api/notifications', notificationRoutes],
  ['/api/dashboard', dashboardRoutes],
  ['/api/allowance-types', allowanceTypeRoutes],
  ['/api/payroll', payrollRoutes],
  ['/api/payslips', payslipRoutes],
  ['/api/reports', reportRoutes],
];

/** OpenAPI catalogue; tests/integration/openapi.test.ts keeps it in step with MOUNTS. */
export const DOCS: Op[] = [...authDocs, ...departmentDocs, ...positionDocs, ...fileDocs, ...employeeDocs, ...userDocs, ...roleDocs, ...settingsDocs, ...calendarDocs, ...attendanceDocs, ...leaveDocs, ...notificationDocs, ...dashboardDocs, ...allowanceDocs, ...payrollDocs, ...reportDocs];

/** Every API route as METHOD + full path (used to keep the OpenAPI document complete). */
export function listRoutes(): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  for (const [base, make] of MOUNTS) {
    for (const layer of make().stack as any[]) {
      if (!layer.route) continue;
      const sub = layer.route.path === '/' ? '' : layer.route.path;
      for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: `${base}${sub}` });
    }
  }
  return out;
}
