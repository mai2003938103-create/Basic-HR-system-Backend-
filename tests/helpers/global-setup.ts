import { runMigrations } from '../../scripts/migrate.js';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/hrms_test';
  await runMigrations(url);
}
