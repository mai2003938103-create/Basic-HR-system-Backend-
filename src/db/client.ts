import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema.js';

// DATE columns stay as 'YYYY-MM-DD' strings (no timezone shifting).
pg.types.setTypeParser(1082, (v: string) => v);

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
