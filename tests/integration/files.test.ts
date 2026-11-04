import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { authenticate } from '../../src/middlewares/authenticate.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { imageUpload, documentUpload, saveUpload, registerDocumentAccess } from '../../src/utils/upload.js';
import { resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factory.js';
import { auth } from '../helpers/app.js';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

function uploadApp() {
  const a = express();
  a.post('/photo', authenticate, imageUpload.single('file'), async (req, res) => {
    res.json({ key: await saveUpload(req.file!, 'photos') });
  });
  a.post('/doc', authenticate, documentUpload.single('file'), async (req, res) => {
    res.json({ key: await saveUpload(req.file!, 'documents') });
  });
  a.use(errorHandler);
  return a;
}

describe('uploads', () => {
  let token: string;
  beforeAll(async () => {
    await resetDb();
    token = (await createUser({ role: 'employee' })).token;
  });

  it('saves a real PNG and serves it to authenticated users', async () => {
    const up = await request(uploadApp()).post('/photo').set(auth(token)).attach('file', PNG, 'a.png');
    expect(up.status).toBe(200);
    expect(up.body.key).toMatch(/^photos\/[0-9a-f-]+\.png$/);
    const get = await request(createApp()).get(`/api/files/${up.body.key}`).set(auth(token));
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
  });

  it('rejects a text file renamed to .png', async () => {
    const res = await request(uploadApp()).post('/photo').set(auth(token)).attach('file', Buffer.from('hello world'), 'fake.png');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('errors.upload.invalidType');
  });

  it('rejects files over 5 MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await request(uploadApp()).post('/photo').set(auth(token)).attach('file', big, 'big.png');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('errors.upload.tooLarge');
  });

  it('requires authentication to download', async () => {
    expect((await request(createApp()).get('/api/files/photos/x.png')).status).toBe(401);
  });

  it('does not allow path traversal', async () => {
    const res = await request(createApp()).get('/api/files/photos/..%2F..%2F.env').set(auth(token));
    expect(res.status).toBe(404);
  });

  it('serves documents only when the access resolver allows it', async () => {
    const up = await request(uploadApp()).post('/doc').set(auth(token)).attach('file', PDF, 'a.pdf');
    expect(up.status).toBe(200);
    registerDocumentAccess(async () => false);
    expect((await request(createApp()).get(`/api/files/${up.body.key}`).set(auth(token))).status).toBe(404);
    registerDocumentAccess(async () => true);
    expect((await request(createApp()).get(`/api/files/${up.body.key}`).set(auth(token))).status).toBe(200);
  });
});
