// Every API router and its OpenAPI entries, in mount order.
import type { Router } from 'express';
import type { Op } from '../utils/openapi.js';

export const MOUNTS: [string, () => Router][] = [];

/** OpenAPI catalogue; tests/integration/openapi.test.ts keeps it in step with MOUNTS. */
export const DOCS: Op[] = [];

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
