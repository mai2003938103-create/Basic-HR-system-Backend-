import { prisma } from '../../src/models/prisma.js';
import { seedBase } from '../../prisma/seed.js';

export { prisma };

let tables: string[] | undefined;

/** Empties every table (FK checks off on one connection) and re-runs the base seed. */
export async function resetDb(): Promise<void> {
  tables ??= (
    await prisma.$queryRaw<{ t: string }[]>`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`
  ).map((r) => r.t);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tables!) await tx.$executeRawUnsafe(`DELETE FROM \`${t}\``);
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  });
  await seedBase(prisma);
}
