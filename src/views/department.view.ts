import type { DepartmentWithManager } from '../models/department.model.js';

export const departmentView = (r: DepartmentWithManager) => ({
  id: r.id,
  code: r.code,
  nameLo: r.nameLo,
  nameEn: r.nameEn,
  description: r.description,
  isActive: r.isActive,
  manager: r.manager ? { id: r.manager.id, firstName: r.manager.firstName, lastName: r.manager.lastName } : null,
  employeeCount: r._count.employees,
});
export type DepartmentDto = ReturnType<typeof departmentView>;
