import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_EMAIL: z.string().email().default('admin@systory.la'),
  ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123'),
  UPLOAD_DIR: z.string().default('uploads'),
  TZ_NAME: z.string().default('Asia/Vientiane'),
  /** Set to the number of reverse proxies in front of the API (e.g. 1 behind Nginx); 0 when exposed directly. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${lines}\nCopy .env.example to .env and fill them in.`);
  }
  return parsed.data;
}

export const env = load();
export type Env = typeof env;
