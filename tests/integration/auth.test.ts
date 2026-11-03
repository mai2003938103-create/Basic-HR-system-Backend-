import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import * as s from '../../src/db/schema.js';
import { resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factory.js';
import { auth } from '../helpers/app.js';

const cookieOf = (res: request.Response) => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('hrms_rt='))?.split(';')[0];
};

describe('auth', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('logs in and sets an httpOnly refresh cookie', async () => {
    const { user, password } = await createUser({ role: 'employee' });
    const res = await request(createApp()).post('/api/auth/login').send({ email: user.email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.permissions).toContain('leave.request');
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/hrms_rt=.+HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { user } = await createUser({ role: 'employee' });
    const app = createApp();
    const a = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong1234' });
    const b = await request(app).post('/api/auth/login').send({ email: 'nobody@test.la', password: 'Wrong1234' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe('errors.auth.invalidCredentials');
    expect(b.body.error.message).toBe('errors.auth.invalidCredentials');
  });

  it('rate-limits the 6th login within a minute', async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ email: 'x@test.la', password: 'Wrong1234' });
    const res = await request(app).post('/api/auth/login').send({ email: 'x@test.la', password: 'Wrong1234' });
    expect(res.status).toBe(429);
  });

  it('does not lock out colleagues who share one office IP', async () => {
    const app = createApp();
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: `user${i}@test.la`, password: 'Wrong1234' });
      expect(res.status).toBe(401);
    }
  });

  it('requires a token for /me', async () => {
    const res = await request(createApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the profile for /me', async () => {
    const { token, employee } = await createUser({ role: 'manager' });
    const res = await request(createApp()).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe('department');
    expect(res.body.data.employee.id).toBe(employee!.id);
  });

  it('rotates the refresh token and detects reuse', async () => {
    const { user, password } = await createUser({ role: 'employee' });
    const app = createApp();
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
    const c1 = cookieOf(login)!;
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', c1);
    expect(r1.status).toBe(200);
    const c2 = cookieOf(r1)!;
    expect(c2).not.toBe(c1);
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', c1);
    expect(reuse.status).toBe(401);
    const after = await request(app).post('/api/auth/refresh').set('Cookie', c2);
    expect(after.status).toBe(401);
  });

  it('revokes the refresh token on logout', async () => {
    const { user, password } = await createUser({ role: 'employee' });
    const app = createApp();
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
    const c = cookieOf(login)!;
    expect((await request(app).post('/api/auth/logout').set('Cookie', c)).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c)).status).toBe(401);
  });

  it('rejects a deactivated user holding a still-valid token (Review Focus 5)', async () => {
    const { user, password, token } = await createUser({ role: 'employee' });
    const app = createApp();
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
    const c = cookieOf(login)!;
    await db.update(s.users).set({ isActive: false }).where(eq(s.users.id, user.id));
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c)).status).toBe(401);
  });

  it('rejects a user whose employee record is inactive', async () => {
    const { employee, token } = await createUser({ role: 'employee' });
    await db.update(s.employees).set({ employmentStatus: 'inactive' }).where(eq(s.employees.id, employee!.id));
    expect((await request(createApp()).get('/api/auth/me').set(auth(token))).status).toBe(401);
  });

  it('changes the password', async () => {
    const { user, password, token } = await createUser({ role: 'employee' });
    await db.update(s.users).set({ mustChangePassword: true }).where(eq(s.users.id, user.id));
    const app = createApp();
    const wrong = await request(app).put('/api/auth/password').set(auth(token)).send({ currentPassword: 'Nope12345', newPassword: 'NewPass123' });
    expect(wrong.status).toBe(400);
    const weak = await request(app).put('/api/auth/password').set(auth(token)).send({ currentPassword: password, newPassword: 'short' });
    expect(weak.status).toBe(400);
    const ok = await request(app).put('/api/auth/password').set(auth(token)).send({ currentPassword: password, newPassword: 'NewPass123' });
    expect(ok.status).toBe(204);
    const [u] = await db.select().from(s.users).where(eq(s.users.id, user.id));
    expect(u.mustChangePassword).toBe(false);
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'NewPass123' });
    expect(login.status).toBe(200);
  });
});
