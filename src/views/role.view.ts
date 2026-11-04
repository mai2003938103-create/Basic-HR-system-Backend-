import type { RoleWithPermissions } from '../models/role.model.js';

export const roleView = (r: RoleWithPermissions) => ({
  id: r.id,
  code: r.code,
  nameLo: r.nameLo,
  nameEn: r.nameEn,
  scope: r.scope,
  isSystem: r.isSystem,
  permissionCodes: r.permissions.map((p) => p.permission.code).sort(),
  userCount: r._count.users,
});
export type RoleDto = ReturnType<typeof roleView>;
