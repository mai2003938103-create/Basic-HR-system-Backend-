// Demo data for trying the system. Never use as real data.
import bcrypt from 'bcrypt';
import { fromDateString } from '../src/models/mappers.js';
import { prisma } from '../src/models/prisma.js';
import { seedBase } from './seed.js';

const norm = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ').normalize('NFC').replace(/ໍາ/g, 'ຳ').toLowerCase();

const DEPTS = [
  { code: 'HR', nameLo: 'ພະແນກບຸກຄະລາກອນ', nameEn: 'Human Resources' },
  { code: 'FIN', nameLo: 'ພະແນກການເງິນ', nameEn: 'Finance' },
  { code: 'IT', nameLo: 'ພະແນກໄອທີ', nameEn: 'Information Technology' },
  { code: 'SALES', nameLo: 'ພະແນກຂາຍ', nameEn: 'Sales' },
];
const FIRST = ['ສົມພອນ', 'ບຸນມີ', 'ຄຳແພງ', 'ວັນນາ', 'ສີສະຫວາດ', 'ນາລີ', 'ພອນສະຫວັນ', 'ອານຸສອນ', 'ມະນີວອນ', 'ສຸກສະຫວັນ'];
const LAST = ['ແກ້ວມະນີ', 'ພົມມະຈັນ', 'ສີຫາລາດ', 'ວົງສະຫວັນ', 'ອິນທະວົງ'];

async function main() {
  await seedBase(prisma);
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const hash = await bcrypt.hash('Demo1234', 12);
  let n = 1;
  for (const d of DEPTS) {
    if (await prisma.department.findUnique({ where: { code: d.code } })) {
      n += 5;
      continue; // already seeded
    }
    const dept = await prisma.department.create({ data: d });
    const mgrPos = await prisma.position.create({ data: { code: `${d.code}-MGR`, nameLo: `ຫົວໜ້າ${d.nameLo}`, nameEn: `${d.nameEn} Manager`, departmentId: dept.id } });
    const stfPos = await prisma.position.create({ data: { code: `${d.code}-STF`, nameLo: `ພະນັກງານ${d.nameLo.replace('ພະແນກ', '')}`, nameEn: `${d.nameEn} Officer`, departmentId: dept.id } });
    for (let i = 0; i < 5; i++, n++) {
      const isMgr = i === 0;
      const firstName = FIRST[(n - 1) % FIRST.length];
      const lastName = LAST[(n - 1) % LAST.length];
      const code = `EMP${String(n).padStart(4, '0')}`;
      const email = `${code.toLowerCase()}@demo.systory.la`;
      const roleCode = d.code === 'HR' && isMgr ? 'hr_admin' : isMgr ? 'manager' : 'employee';
      await prisma.$transaction(async (tx) => {
        const e = await tx.employee.create({
          data: {
            employeeCode: code, firstName, lastName, gender: n % 2 ? 'male' : 'female',
            dateOfBirth: fromDateString(`199${n % 10}-0${(n % 9) + 1}-15`), phone: `020${String(55500000 + n)}`, email,
            departmentId: dept.id, positionId: (isMgr ? mgrPos : stfPos).id, hireDate: fromDateString(`202${n % 5}-0${(n % 9) + 1}-01`),
            basicSalary: isMgr ? '12000000' : '6500000', searchText: norm(code, firstName, lastName, email),
          },
        });
        await tx.user.create({ data: { email, passwordHash: hash, employeeId: e.id, roles: { create: { roleId: roles[roleCode] } } } });
        if (isMgr) await tx.department.update({ where: { id: dept.id }, data: { managerId: e.id } });
      });
    }
  }
  console.log('Demo data ready. Demo password for every demo account: Demo1234');
}

main().finally(() => prisma.$disconnect());
