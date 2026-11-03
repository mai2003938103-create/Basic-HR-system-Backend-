import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

export async function runMigrations(url: string, opts: { reset?: boolean } = {}): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    if (opts.reset) {
      await pool.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
    }
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await import('dotenv/config');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  await runMigrations(url, { reset: process.argv.includes('--reset') });
  console.log('Migrations applied');
}
