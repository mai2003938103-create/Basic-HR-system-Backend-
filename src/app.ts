import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './lib/errors.js';
import { buildOpenApi } from './lib/openapi.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { departmentRoutes } from './modules/departments/departments.routes.js';
import { positionRoutes } from './modules/positions/positions.routes.js';
import { fileRoutes } from './modules/files/files.routes.js';
import { employeeRoutes } from './modules/employees/employees.routes.js';
import { userRoutes } from './modules/users/users.routes.js';
import { permissionRoutes, roleRoutes } from './modules/roles/roles.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';
import { holidayRoutes } from './modules/holidays/holidays.routes.js';
import { leaveTypeRoutes } from './modules/leave-types/leave-types.routes.js';
import { attendanceRoutes } from './modules/attendance/attendance.routes.js';
import { leaveBalanceRoutes, leaveRoutes } from './modules/leave/leave.routes.js';
import { notificationRoutes } from './modules/notifications/notifications.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';

const MOUNTS: [string, () => Router][] = [
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
];

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

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  if (env.NODE_ENV !== 'production') {
    const doc = buildOpenApi();
    app.get('/api/docs.json', (_req, res) => res.json(doc));
    app.use('/api/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(doc));
  }

  for (const [path, make] of MOUNTS) app.use(path, make());

  app.use('/api', (_req, _res, next) => next(notFound()));
  app.use(errorHandler);
  return app;
}
