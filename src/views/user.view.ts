import type { UserDtoRow } from '../models/user.model.js';

export const userView = ({ roles, ...u }: UserDtoRow) => ({ ...u, roles: roles.map((r) => r.role.code).sort() });
