import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import router from '../../src/routes/jobs.js';

setupTests();
const app = createTestApp('/api/v1/jobs', router);

describe('jobs routes (supertest)', () => {
  it('GET /jobs 返 200 + data 数组', async () => {
    const r = await request(app).get('/api/v1/jobs?pageSize=5');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.data)).toBe(true);
  });

  it('POST /jobs 创建（admin 成功）', async () => {
    const r = await request(app).post('/api/v1/jobs').send({ title: 'E2E Test Job', city: '北京' });
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBeGreaterThan(0);
    expect(r.body.data.title).toBe('E2E Test Job');
  });

  it('POST /jobs 缺 title → 400', async () => {
    const r = await request(app).post('/api/v1/jobs').send({ city: '北京' });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('GET /jobs/:id 详情', async () => {
    const created = await request(app).post('/api/v1/jobs').send({ title: 'Detail Test' });
    const id = created.body.data.id;
    const r = await request(app).get(`/api/v1/jobs/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(id);
  });

  it('GET /jobs/:id 不存在 → 404', async () => {
    const r = await request(app).get('/api/v1/jobs/99999');
    expect(r.status).toBe(404);
  });

  it('PUT /jobs/:id 更新', async () => {
    const c = await request(app).post('/api/v1/jobs').send({ title: 'Old' });
    const id = c.body.data.id;
    const r = await request(app).put(`/api/v1/jobs/${id}`).send({ status: 'closed' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('closed');
  });

  it('DELETE /jobs/:id 软删', async () => {
    const c = await request(app).post('/api/v1/jobs').send({ title: 'DeleteMe' });
    const id = c.body.data.id;
    const r = await request(app).delete(`/api/v1/jobs/${id}`);
    expect(r.status).toBe(200);
    const g = await request(app).get(`/api/v1/jobs/${id}`);
    expect(g.status).toBe(404);
  });

  it('GET /jobs/lookup 返 active 列表', async () => {
    await request(app).post('/api/v1/jobs').send({ title: 'Active', status: 'open' });
    await request(app).post('/api/v1/jobs').send({ title: 'Closed', status: 'closed' });
    const r = await request(app).get('/api/v1/jobs/lookup');
    expect(r.status).toBe(200);
    r.body.data.forEach(j => expect(j.status).not.toBe('closed'));
  });
});
