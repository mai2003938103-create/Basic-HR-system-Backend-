// Every API router and its OpenAPI entries, in mount order.
import type { Router } from 'express';
import type { Op } from '../utils/openapi.js';
import { authDocs, authRoutes } from './auth.routes.js';
import { departmentDocs, departmentRoutes } from './departments.routes.js';
import { employeeDocs, employeeRoutes } from './employees.routes.js';
import { fileDocs, fileRoutes } from './files.routes.js';
import { positionDocs, positionRoutes } from './positions.routes.js';
import { permissionRoutes, roleDocs, roleRoutes } from './roles.routes.js';
import { userDocs, userRoutes } from './users.routes.js';

export const MOUNTS: [string, () => Router][] = [
  ['/api/auth', authRoutes],
  ['/api/departments', departmentRoutes],
  ['/api/positions', positionRoutes],
  ['/api/files', fileRoutes],
  ['/api/employees', employeeRoutes],
  ['/api/users', userRoutes],
  ['/api/roles', roleRoutes],
  ['/api/permissions', permissionRoutes],
];

/** OpenAPI catalogue; tests/integration/openapi.test.ts keeps it in step with MOUNTS. */
export const DOCS: Op[] = [...authDocs, ...departmentDocs, ...positionDocs, ...fileDocs, ...employeeDocs, ...userDocs, ...roleDocs];

/** Every API route as METHOD + full path (used to keep the OpenAPI document complete). */
export function listRoutes(): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  for (const [base, make] of MOUNTS) {
    for (const layer of make().stack as any[]) {
      if (!layer.route) continue;
      const sub = layer.route.path === '/' ? '' : layer.route.path;
      for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: `${base}${sub}` });
    }
  }
  return out;
}
