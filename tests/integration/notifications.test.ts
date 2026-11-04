import { prisma as db, resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factory.js';
import { auth, testApp } from '../helpers/app.js';

describe('notifications', () => {
  beforeEach(resetDb);

  it('shows only my notifications and marks them read', async () => {
    const me = await createUser({ role: 'employee' });
    const other = await createUser({ role: 'employee' });
    const mine = await db.notification.create({ data: { userId: me.user.id, type: 't', titleKey: 'k' } });
    const theirs = await db.notification.create({ data: { userId: other.user.id, type: 't', titleKey: 'k' } });
    const list = await testApp().get('/api/notifications').set(auth(me.token));
    expect(list.body.data.map((n: any) => n.id)).toEqual([mine.id]);
    expect(list.body.unread).toBe(1);
    expect((await testApp().put(`/api/notifications/${theirs.id}/read`).set(auth(me.token))).status).toBe(404);
    expect((await testApp().put(`/api/notifications/${mine.id}/read`).set(auth(me.token))).status).toBe(200);
    expect((await testApp().get('/api/notifications?unread=true').set(auth(me.token))).body.data).toHaveLength(0);
    await db.notification.createMany({ data: [{ userId: me.user.id, type: 't', titleKey: 'k' }, { userId: me.user.id, type: 't', titleKey: 'k' }] });
    expect((await testApp().put('/api/notifications/read-all').set(auth(me.token))).status).toBe(204);
    expect((await testApp().get('/api/notifications').set(auth(me.token))).body.unread).toBe(0);
  });
});
