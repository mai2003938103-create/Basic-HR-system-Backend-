import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { env } from '../config/env.js';
import { databaseUrl } from '../config/database-url.js';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

export const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl(env.DATABASE_URL)) });

/** The client or an interactive transaction; services pass `tx` down to models. */
export type Db = PrismaClient | Prisma.TransactionClient;
