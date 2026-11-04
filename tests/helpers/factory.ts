import bcrypt from 'bcrypt';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { prisma } from '../../src/models/prisma.js';
import { fromDateString } from '../../src/models/mappers.js';
import { toEmployeeRow, type EmployeeRow } from '../../src/models/employee.model.js';
import { signAccessToken } from '../../src/utils/jwt.js';

let seq = 0;
const next = () => ++seq;
// Hash once; bcrypt cost 12 per user would make the suite slow.
let cachedHash: string | undefined;
export const DEFAULT_PASSWORD = 'Passw0rd1';
const hash = async () => (cachedHash ??= await bcrypt.hash(DEFAULT_PASSWORD, 4));

export async function createDepartment(overrides: Partial<Prisma.DepartmentUncheckedCreateInput> = {}) {
  const n = next();
  return prisma.department.create({ data: { code: `D${n}`, nameLo: `ພະແນກ ${n}`, nameEn: `Dept ${n}`, ...overrides } });
}

export async function createPosition(overrides: Partial<Prisma.PositionUncheckedCreateInput> = {}) {
  const n = next();
  const departmentId = overrides.departmentId ?? (await createDepartment()).id;
  return prisma.position.create({ data: { code: `P${n}`, nameLo: `ຕຳແໜ່ງ ${n}`, nameEn: `Position ${n}`, ...overrides, departmentId } });
}

/** Overrides use the Stage 1 row shape: calendar dates as 'YYYY-MM-DD', money as strings or numbers. */
export type EmployeeOverrides = Partial<Omit<Prisma.EmployeeUncheckedCreateInput, 'dateOfBirth' | 'hireDate' | 'endDate' | 'basicSalary'>> & {
  dateOfBirth?: string;
  hireDate?: string;
  endDate?: string | null;
  basicSalary?: string | number;
};

export async function createEmployee(overrides: EmployeeOverrides = {}): Promise<EmployeeRow> {
  const n = next();
  const departmentId = overrides.departmentId ?? (await createDepartment()).id;
  const positionId = overrides.positionId ?? (await createPosition({ departmentId })).id;
  const firstName = overrides.firstName ?? `First${n}`;
  const lastName = overrides.lastName ?? `Last${n}`;
  const employeeCode = overrides.employeeCode ?? `E${String(n).padStart(5, '0')}`;
  const email = overrides.email ?? `e${n}@test.la`;
  const { dateOfBirth, hireDate, endDate, basicSalary, ...rest } = overrides;
  const e = await prisma.employee.create({
    data: {
      gender: 'male',
      phone: `0205550${String(n).padStart(4, '0')}`,
      searchText: [employeeCode, firstName, lastName, email].join(' ').normalize('NFC').toLowerCase(),
      ...rest,
      dateOfBirth: fromDateString(dateOfBirth ?? '1990-01-01'),
      hireDate: fromDateString(hireDate ?? '2024-01-01'),
      endDate: endDate ? fromDateString(endDate) : null,
      basicSalary: String(basicSalary ?? '5000000'),
      firstName,
      lastName,
      employeeCode,
      email,
      departmentId,
      positionId,
    },
  });
  return toEmployeeRow(e);
}

type RoleCode = 'super_admin' | 'hr_admin' | 'manager' | 'employee';

export async function createUser(opts: {
  role: RoleCode;
  departmentId?: string;
  managerOf?: boolean;
  active?: boolean;
  withEmployee?: boolean;
  employee?: EmployeeOverrides;
} = { role: 'employee' }) {
  const n = next();
  const withEmployee = opts.withEmployee ?? true;
  const employee = withEmployee
    ? await createEmployee({ ...opts.employee, ...(opts.departmentId ? { departmentId: opts.departmentId } : {}) })
    : null;
  if (employee && (opts.managerOf ?? opts.role === 'manager')) {
    await prisma.department.update({ where: { id: employee.departmentId }, data: { managerId: employee.id } });
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { code: opts.role } });
  const user = await prisma.user.create({
    data: {
      email: employee?.email ?? `u${n}@test.la`,
      passwordHash: await hash(),
      isActive: opts.active ?? true,
      employeeId: employee?.id ?? null,
      roles: { create: { roleId: role.id } },
    },
  });
  return { user, employee, password: DEFAULT_PASSWORD, token: signAccessToken({ sub: user.id }) };
}
