import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { conflict } from '../../src/utils/errors.js';
import { validate } from '../../src/middlewares/validate.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.get('/conflict', () => {
    throw conflict('x');
  });
  a.post('/v', validate({ body: z.object({ a: z.string() }) }), (_req, res) => res.json({ ok: true }));
  a.get('/boom', () => {
    throw new Error('boom');
  });
  a.get('/async', async () => {
    throw conflict('async');
  });
  a.use(errorHandler);
  return a;
}

describe('error handling', () => {
  it('maps AppError to its status and code', async () => {
    const res = await request(app()).get('/conflict');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'x' } });
  });

  it('maps errors thrown from async handlers', async () => {
    const res = await request(app()).get('/async');
    expect(res.status).toBe(409);
  });

  it('returns field details for validation errors', async () => {
    const res = await request(app()).post('/v').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('a');
  });

  it('hides internal error messages', async () => {
    const res = await request(app()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('boom');
  });

  it('maps a unique violation (Prisma P2002 / MySQL 1062) to 409', async () => {
    const a = express();
    a.get('/dup', () => {
      throw Object.assign(new Error('dup'), { code: 'P2002' });
    });
    a.get('/dup-raw', () => {
      throw Object.assign(new Error('dup'), { errno: 1062 });
    });
    a.use(errorHandler);
    for (const path of ['/dup', '/dup-raw']) {
      const res = await request(a).get(path);
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe('errors.common.duplicate');
    }
  });
});
