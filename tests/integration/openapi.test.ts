import { buildOpenApi } from '../../src/lib/openapi.js';
import { listRoutes } from '../../src/app.js';

describe('OpenAPI', () => {
  it('documents every registered route', () => {
    const doc = buildOpenApi();
    const documented = new Set(
      Object.entries(doc.paths ?? {}).flatMap(([p, ops]) => Object.keys(ops as object).map((m) => `${m.toUpperCase()} ${p}`)),
    );
    const missing = listRoutes()
      .filter((r) => !['/api/health', '/api/docs', '/api/docs.json'].includes(r.path))
      .map((r) => `${r.method} ${r.path.replace(/:(\w+)/g, '{$1}')}`)
      .filter((k) => !documented.has(k));
    expect(missing).toEqual([]);
  });

  it('serves the JSON document in development and test', async () => {
    const { testApp } = await import('../helpers/app.js');
    const res = await testApp().get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
  });
});
