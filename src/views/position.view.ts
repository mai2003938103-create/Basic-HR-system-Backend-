import type { PositionWithDepartment } from '../models/position.model.js';

export const positionView = (r: PositionWithDepartment) => ({
  id: r.id,
  code: r.code,
  nameLo: r.nameLo,
  nameEn: r.nameEn,
  description: r.description,
  isActive: r.isActive,
  department: { id: r.department.id, nameLo: r.department.nameLo, nameEn: r.department.nameEn },
  employeeCount: r._count.employees,
});
