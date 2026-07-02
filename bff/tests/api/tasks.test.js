import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import router from '../../src/routes/tasks.js';

setupTests();
const app = createTestApp('/api/v1/tasks', router);

describe('tasks routes (supertest)', () => {
  it('GET /tasks 空列表', async () => {
    const r = await request(app).get('/api/v1/tasks');
    expect(r.status).toBe(200);
    expect(r.body.meta.total).toBe(0);
  });

  it('POST /tasks 创建', async () => {
    const r = await request(app).post('/api/v1/tasks').send({
      title: '跟进候选张三',
      priority: 'high',
      due_date: '2026-08-15',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBeGreaterThan(0);
    expect(r.body.data.title).toBe('跟进候选张三');
    expect(r.body.data.priority).toBe('high');
  });

  it('POST /tasks 缺 title → 400', async () => {
    const r = await request(app).post('/api/v1/tasks').send({ priority: 'low' });
    expect(r.status).toBe(400);
  });

  it('PUT /tasks/:id 更新 status', async () => {
    const c = await request(app).post('/api/v1/tasks').send({ title: 'X' });
    const id = c.body.data.id;
    const r = await request(app).put(`/api/v1/tasks/${id}`).send({ status: 'completed' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('completed');
  });

  it('DELETE /tasks/:id 软删', async () => {
    const c = await request(app).post('/api/v1/tasks').send({ title: 'D' });
    const id = c.body.data.id;
    const r = await request(app).delete(`/api/v1/tasks/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.deleted).toBe(true);
  });

  it('GET /tasks?status=pending 筛选', async () => {
    await request(app).post('/api/v1/tasks').send({ title: 'A' });
    const r = await request(app).get('/api/v1/tasks?status=pending');
    expect(r.status).toBe(200);
    r.body.data.forEach(t => expect(t.status).toBe('pending'));
  });
});
