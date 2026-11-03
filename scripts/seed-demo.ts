// Demo data for trying the system. Never use as real data.
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import * as s from '../src/db/schema.js';
import { db, pool } from '../src/db/client.js';
import { seedBase } from './seed.js';

const norm = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ').normalize('NFC').replace(/\u0ECD\u0EB2/g, '\u0EB3').toLowerCase();

const DEPTS = [
  { code: 'HR', nameLo: 'ພະແນກບຸກຄະລາກອນ', nameEn: 'Human Resources' },
  { code: 'FIN', nameLo: 'ພະແນກການເງິນ', nameEn: 'Finance' },
  { code: 'IT', nameLo: 'ພະແນກໄອທີ', nameEn: 'Information Technology' },
  { code: 'SALES', nameLo: 'ພະແນກຂາຍ', nameEn: 'Sales' },
];
const FIRST = ['ສົມພອນ', 'ບຸນມີ', 'ຄຳແພງ', 'ວັນນາ', 'ສີສະຫວາດ', 'ນາລີ', 'ພອນສະຫວັນ', 'ອານຸສອນ', 'ມະນີວອນ', 'ສຸກສະຫວັນ'];
const LAST = ['ແກ້ວມະນີ', 'ພົມມະຈັນ', 'ສີຫາລາດ', 'ວົງສະຫວັນ', 'ອິນທະວົງ'];

async function main() {
  await seedBase(db);
  const roles = Object.fromEntries((await db.select().from(s.roles)).map((r) => [r.code, r.id]));
  const hash = await bcrypt.hash('Demo1234', 12);
  let n = 1;
  for (const d of DEPTS) {
    const [dept] = await db.insert(s.departments).values(d).onConflictDoNothing().returning();
    if (!dept) continue; // already seeded
    const posRows = await db
      .insert(s.positions)
      .values([
        { code: `${d.code}-MGR`, nameLo: `ຫົວໜ້າ${d.nameLo}`, nameEn: `${d.nameEn} Manager`, departmentId: dept.id },
        { code: `${d.code}-STF`, nameLo: `ພະນັກງານ${d.nameLo.replace('ພະແນກ', '')}`, nameEn: `${d.nameEn} Officer`, departmentId: dept.id },
      ])
      .returning();
    for (let i = 0; i < 5; i++, n++) {
      const isMgr = i === 0;
      const firstName = FIRST[(n - 1) % FIRST.length];
      const lastName = LAST[(n - 1) % LAST.length];
      const code = `EMP${String(n).padStart(4, '0')}`;
      const email = `${code.toLowerCase()}@demo.systory.la`;
      await db.transaction(async (tx) => {
        const [e] = await tx
          .insert(s.employees)
          .values({
            employeeCode: code, firstName, lastName, gender: n % 2 ? 'male' : 'female',
            dateOfBirth: `199${n % 10}-0${(n % 9) + 1}-15`, phone: `020${String(55500000 + n)}`, email,
            departmentId: dept.id, positionId: posRows[isMgr ? 0 : 1].id, hireDate: `202${n % 5}-0${(n % 9) + 1}-01`,
            basicSalary: isMgr ? '12000000' : '6500000', searchText: norm(code, firstName, lastName, email),
          })
          .returning();
        const [u] = await tx.insert(s.users).values({ email, passwordHash: hash, employeeId: e.id }).returning();
        const roleCode = d.code === 'HR' && isMgr ? 'hr_admin' : isMgr ? 'manager' : 'employee';
        await tx.insert(s.userRoles).values({ userId: u.id, roleId: roles[roleCode] });
        if (isMgr) await tx.update(s.departments).set({ managerId: e.id }).where(eq(s.departments.id, dept.id));
      });
    }
  }
  console.log('Demo data ready. Demo password for every demo account: Demo1234');
}

main().finally(() => pool.end());
