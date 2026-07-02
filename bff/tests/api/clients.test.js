import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import router from '../../src/routes/clients.js';

setupTests();
const app = createTestApp('/api/v1/clients', router);

describe('clients routes (supertest)', () => {
  it('GET /clients 空列表', async () => {
    const r = await request(app).get('/api/v1/clients');
    expect(r.status).toBe(200);
    expect(r.body.meta.total).toBe(0);
  });

  it('POST /clients 创建', async () => {
    const r = await request(app).post('/api/v1/clients').send({
      name: '测试客户',
      industry: '互联网',
      city: '上海',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBeGreaterThan(0);
    expect(r.body.data.name).toBe('测试客户');
  });

  it('POST /clients 缺 name → 400', async () => {
    const r = await request(app).post('/api/v1/clients').send({ industry: 'X' });
    expect(r.status).toBe(400);
  });

  it('GET /clients/:id 详情', async () => {
    const c = await request(app).post('/api/v1/clients').send({ name: 'Detail' });
    const id = c.body.data.id;
    const r = await request(app).get(`/api/v1/clients/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(id);
    expect(Array.isArray(r.body.data.notes)).toBe(true);
  });

  it('PUT /clients/:id 更新', async () => {
    const c = await request(app).post('/api/v1/clients').send({ name: 'Old' });
    const id = c.body.data.id;
    const r = await request(app).put(`/api/v1/clients/${id}`).send({ contact_email: 'new@x.com' });
    expect(r.status).toBe(200);
    expect(r.body.data.contact_email).toBe('new@x.com');
  });

  it('DELETE /clients/:id 软删', async () => {
    const c = await request(app).post('/api/v1/clients').send({ name: 'Delete' });
    const id = c.body.data.id;
    const r = await request(app).delete(`/api/v1/clients/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.deleted).toBe(true);
    const g = await request(app).get(`/api/v1/clients/${id}`);
    expect(g.status).toBe(404);
  });

  it('POST /clients/:id/notes 备注创建', async () => {
    const c = await request(app).post('/api/v1/clients').send({ name: 'Notes' });
    const id = c.body.data.id;
    const r = await request(app).post(`/api/v1/clients/${id}/notes`).send({
      content: '初次接触',
      follow_up: '下周一约面',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.content).toBe('初次接触');
  });

  it('GET /clients/:id/notes 列备注', async () => {
    const c = await request(app).post('/api/v1/clients').send({ name: 'NoteList' });
    const id = c.body.data.id;
    await request(app).post(`/api/v1/clients/${id}/notes`).send({ content: 'A' });
    await request(app).post(`/api/v1/clients/${id}/notes`).send({ content: 'B' });
    const r = await request(app).get(`/api/v1/clients/${id}/notes`);
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBe(2);
  });

  it('PUT /clients/:id/notes/:nid 备注更新', async () => {
    const c = await request(app).post('/api/v1/clients').send({ name: 'C' });
    const id = c.body.data.id;
    const n = await request(app).post(`/api/v1/clients/${id}/notes`).send({ content: 'old' });
    const nid = n.body.data.id;
    const r = await request(app).put(`/api/v1/clients/${id}/notes/${nid}`).send({ content: 'new' });
    expect(r.status).toBe(200);
    expect(r.body.data.content).toBe('new');
  });

  it('DELETE /clients/:id/notes/:nid 备注软删', async () => {
    const c = await request(app).post('/api/v1/clients').send({ name: 'C' });
    const id = c.body.data.id;
    const n = await request(app).post(`/api/v1/clients/${id}/notes`).send({ content: 'rm' });
    const nid = n.body.data.id;
    const r = await request(app).delete(`/api/v1/clients/${id}/notes/${nid}`);
    expect(r.status).toBe(200);
    expect(r.body.data.deleted).toBe(true);
  });
});
