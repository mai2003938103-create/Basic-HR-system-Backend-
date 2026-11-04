import type { Employee } from '../generated/prisma/client.js';
import { decimalString, toDateString } from './mappers.js';

/** Employee in its Stage 1 shape: calendar dates as 'YYYY-MM-DD', basicSalary as a 2-decimal string. */
export type EmployeeRow = Omit<Employee, 'dateOfBirth' | 'hireDate' | 'endDate' | 'basicSalary'> & {
  dateOfBirth: string;
  hireDate: string;
  endDate: string | null;
  basicSalary: string;
};

export const toEmployeeRow = (e: Employee): EmployeeRow => ({
  ...e,
  dateOfBirth: toDateString(e.dateOfBirth)!,
  hireDate: toDateString(e.hireDate)!,
  endDate: toDateString(e.endDate),
  basicSalary: decimalString(e.basicSalary, 2)!,
});
