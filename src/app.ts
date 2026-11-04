import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './utils/errors.js';
import { buildOpenApi } from './utils/openapi.js';
import { MOUNTS } from './routes/index.js';

export { listRoutes } from './routes/index.js';

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
