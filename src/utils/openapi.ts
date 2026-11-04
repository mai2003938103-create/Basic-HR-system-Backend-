import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z, type ZodTypeAny } from 'zod';
import { idParams } from './http.js';
import { DOCS } from '../routes/index.js';
extendZodWithOpenApi(z);

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
/** One documented route; each routes/<name>.routes.ts exports its list. */
export interface Op {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  permission?: string;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
  multipart?: Record<string, 'string' | 'binary'>;
  status?: number;
  public?: boolean;
}

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.array(z.object({ field: z.string(), message: z.string() })).optional() }) });

/** Strips refinements/effects so the generator sees the plain object shape. */
function plain(s: ZodTypeAny): ZodTypeAny {
  let cur: any = s;
  while (cur?._def?.schema) cur = cur._def.schema;
  return cur;
}

export function buildOpenApi(ops: Op[] = DOCS) {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearer', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  for (const op of ops) {
    const params = [...op.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
    const status = op.status ?? 200;
    registry.registerPath({
      method: op.method,
      path: op.path.replace(/:(\w+)/g, '{$1}'),
      tags: [op.tag],
      summary: op.summary,
      description: op.permission ? `Requires permission \`${op.permission}\`.` : undefined,
      security: op.public ? [] : [{ bearer: [] }],
      request: {
        ...(params.length ? { params: params.length === 1 && params[0] === 'id' ? idParams : z.object(Object.fromEntries(params.map((p) => [p, z.string()]))) } : {}),
        ...(op.query ? { query: plain(op.query) as any } : {}),
        ...(op.body ? { body: { content: { 'application/json': { schema: plain(op.body) } } } } : {}),
        ...(op.multipart
          ? {
              body: {
                content: {
                  'multipart/form-data': {
                    schema: z.object(Object.fromEntries(Object.entries(op.multipart).map(([k, t]) => [k, t === 'binary' ? z.any().openapi({ type: 'string', format: 'binary' }) : z.string()]))),
                  },
                },
              },
            }
          : {}),
      },
      responses: {
        [status]: { description: status === 204 ? 'No content' : 'OK' },
        400: { description: 'Validation error', content: { 'application/json': { schema: errorSchema } } },
        ...(op.public ? {} : { 401: { description: 'Not signed in', content: { 'application/json': { schema: errorSchema } } } }),
        ...(op.permission ? { 403: { description: 'Missing permission', content: { 'application/json': { schema: errorSchema } } } } : {}),
      },
    });
  }
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: { title: 'Systory HRMS API', version: '1.0.0', description: 'Systory HRMS API. Lists return { data, meta }; errors return { error: { code, message, details? } } where message is an i18n key.' },
    servers: [{ url: 'http://localhost:4000' }],
  });
}
