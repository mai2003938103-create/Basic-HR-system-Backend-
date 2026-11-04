// Recreates the test database and applies every Prisma migration's SQL in order.
// (Equivalent to `prisma migrate reset` without needing Prisma's native schema engine.)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';
import { databaseUrl } from '../../src/config/database-url.js';

const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../prisma/migrations');

export default async function setup() {
  const url = new URL(databaseUrl(process.env.TEST_DATABASE_URL ?? 'mysql://root:root@127.0.0.1:3306/hrms_test'));
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(database) || !database.includes('test')) throw new Error(`Refusing to reset "${database}": the test database name must contain "test"`);
  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    allowPublicKeyRetrieval: true,
    multipleStatements: true,
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await conn.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conn.query(`USE \`${database}\``);
    for (const dir of readdirSync(migrations).filter((d) => existsSync(path.join(migrations, d, 'migration.sql'))).sort()) {
      await conn.query(readFileSync(path.join(migrations, dir, 'migration.sql'), 'utf8'));
    }
  } finally {
    await conn.end();
  }
}
