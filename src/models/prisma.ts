import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { env } from '../config/env.js';
import { databaseUrl } from '../config/database-url.js';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

export const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl(env.DATABASE_URL)) });

/** The client or an interactive transaction; services pass `tx` down to models. */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Interactive transaction for services. READ COMMITTED (PostgreSQL's default, which the business rules were written
 * for): a row read after lockRows() shows its latest committed values, not the transaction's first snapshot.
 */
export const withTx = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { isolationLevel: 'ReadCommitted' });
