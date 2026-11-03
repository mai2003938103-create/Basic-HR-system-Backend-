import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import * as s from '../../src/db/schema.js';
import { signAccessToken } from '../../src/lib/jwt.js';

let seq = 0;
const next = () => ++seq;
// Hash once; bcrypt cost 12 per user would make the suite slow.
let cachedHash: string | undefined;
export const DEFAULT_PASSWORD = 'Passw0rd1';
const hash = async () => (cachedHash ??= await bcrypt.hash(DEFAULT_PASSWORD, 4));

export async function createDepartment(overrides: Partial<typeof s.departments.$inferInsert> = {}) {
  const n = next();
  const [d] = await db
    .insert(s.departments)
    .values({ code: `D${n}`, nameLo: `ພະແນກ ${n}`, nameEn: `Dept ${n}`, ...overrides })
    .returning();
  return d;
}

export async function createPosition(overrides: Partial<typeof s.positions.$inferInsert> = {}) {
  const n = next();
  const departmentId = overrides.departmentId ?? (await createDepartment()).id;
  const [p] = await db
    .insert(s.positions)
    .values({ code: `P${n}`, nameLo: `ຕຳແໜ່ງ ${n}`, nameEn: `Position ${n}`, ...overrides, departmentId })
    .returning();
  return p;
}

export async function createEmployee(overrides: Partial<typeof s.employees.$inferInsert> = {}) {
  const n = next();
  const departmentId = overrides.departmentId ?? (await createDepartment()).id;
  const positionId = overrides.positionId ?? (await createPosition({ departmentId })).id;
  const firstName = overrides.firstName ?? `First${n}`;
  const lastName = overrides.lastName ?? `Last${n}`;
  const employeeCode = overrides.employeeCode ?? `E${String(n).padStart(5, '0')}`;
  const email = overrides.email ?? `e${n}@test.la`;
  const [e] = await db
    .insert(s.employees)
    .values({
      gender: 'male',
      dateOfBirth: '1990-01-01',
      phone: `0205550${String(n).padStart(4, '0')}`,
      hireDate: '2024-01-01',
      basicSalary: '5000000',
      searchText: [employeeCode, firstName, lastName, email].join(' ').normalize('NFC').toLowerCase(),
      ...overrides,
      firstName,
      lastName,
      employeeCode,
      email,
      departmentId,
      positionId,
    })
    .returning();
  return e;
}

type RoleCode = 'super_admin' | 'hr_admin' | 'manager' | 'employee';

export async function createUser(opts: {
  role: RoleCode;
  departmentId?: string;
  managerOf?: boolean;
  active?: boolean;
  withEmployee?: boolean;
  employee?: Partial<typeof s.employees.$inferInsert>;
} = { role: 'employee' }) {
  const n = next();
  const withEmployee = opts.withEmployee ?? true;
  const employee = withEmployee
    ? await createEmployee({ ...opts.employee, ...(opts.departmentId ? { departmentId: opts.departmentId } : {}) })
    : null;
  if (employee && (opts.managerOf ?? opts.role === 'manager')) {
    await db.update(s.departments).set({ managerId: employee.id }).where(eq(s.departments.id, employee.departmentId));
  }
  const [role] = await db.select().from(s.roles).where(eq(s.roles.code, opts.role));
  const [user] = await db
    .insert(s.users)
    .values({
      email: employee?.email ?? `u${n}@test.la`,
      passwordHash: await hash(),
      isActive: opts.active ?? true,
      employeeId: employee?.id ?? null,
    })
    .returning();
  await db.insert(s.userRoles).values({ userId: user.id, roleId: role.id });
  return { user, employee, password: DEFAULT_PASSWORD, token: signAccessToken({ sub: user.id }) };
}
