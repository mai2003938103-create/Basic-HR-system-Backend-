import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './lib/errors.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { departmentRoutes } from './modules/departments/departments.routes.js';
import { positionRoutes } from './modules/positions/positions.routes.js';
import { fileRoutes } from './modules/files/files.routes.js';
import { employeeRoutes } from './modules/employees/employees.routes.js';
import { userRoutes } from './modules/users/users.routes.js';
import { permissionRoutes, roleRoutes } from './modules/roles/roles.routes.js';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  app.use('/api/auth', authRoutes());
  app.use('/api/departments', departmentRoutes());
  app.use('/api/positions', positionRoutes());
  app.use('/api/files', fileRoutes());
  app.use('/api/employees', employeeRoutes());
  app.use('/api/users', userRoutes());
  app.use('/api/roles', roleRoutes());
  app.use('/api/permissions', permissionRoutes());

  app.use('/api', (_req, _res, next) => next(notFound()));
  app.use(errorHandler);

  return app;
}
