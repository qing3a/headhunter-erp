import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import router from '../../src/routes/candidates.js';

setupTests();
const app = createTestApp('/api/v1/candidates', router);

describe('candidates routes (supertest)', () => {
  it('GET /candidates 空列表', async () => {
    const r = await request(app).get('/api/v1/candidates');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.meta.total).toBe(0);
  });

  it('POST /candidates 创建（admin）', async () => {
    const r = await request(app).post('/api/v1/candidates').send({
      name: '王测试',
      email: 'test@e2e.com',
      phone: '13800138000',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBeGreaterThan(0);
    expect(r.body.data.name).toBe('王测试');
  });

  it('POST /candidates 缺 name → 400', async () => {
    const r = await request(app).post('/api/v1/candidates').send({ email: 'no@name.com' });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('GET /candidates/:id 详情', async () => {
    const c = await request(app).post('/api/v1/candidates').send({ name: '详情测试' });
    const id = c.body.data.id;
    const r = await request(app).get(`/api/v1/candidates/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(id);
    expect(r.body.data.experiences).toBeDefined();
  });

  it('GET /candidates/:id 不存在 → 404', async () => {
    const r = await request(app).get('/api/v1/candidates/99999');
    expect(r.status).toBe(404);
  });

  it('PUT /candidates/:id 更新', async () => {
    const c = await request(app).post('/api/v1/candidates').send({ name: '改名前' });
    const id = c.body.data.id;
    const r = await request(app).put(`/api/v1/candidates/${id}`).send({ current_company: '新公司' });
    expect(r.status).toBe(200);
    expect(r.body.data.current_company).toBe('新公司');
  });

  it('DELETE /candidates/:id 软删', async () => {
    const c = await request(app).post('/api/v1/candidates').send({ name: '删我' });
    const id = c.body.data.id;
    const r = await request(app).delete(`/api/v1/candidates/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.deleted).toBe(true);
    const g = await request(app).get(`/api/v1/candidates/${id}`);
    expect(g.status).toBe(404);
  });

  it('POST /candidates/check-email 邮箱查重', async () => {
    await request(app).post('/api/v1/candidates').send({ name: 'X', email: 'dup@e2e.com' });
    const r = await request(app).get('/api/v1/candidates/check-email?email=dup@e2e.com');
    expect(r.status).toBe(200);
    expect(r.body.data.available).toBe(false);
  });

  it('GET /candidates?all_pages=true admin 全选', async () => {
    await request(app).post('/api/v1/candidates').send({ name: 'A' });
    await request(app).post('/api/v1/candidates').send({ name: 'B' });
    const r = await request(app).get('/api/v1/candidates?all_pages=true');
    expect(r.status).toBe(200);
    expect(r.body.data.ids.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /candidates/batch 批量 status', async () => {
    const a = await request(app).post('/api/v1/candidates').send({ name: 'A1' });
    const b = await request(app).post('/api/v1/candidates').send({ name: 'A2' });
    const r = await request(app).post('/api/v1/candidates/batch').send({
      action: 'status',
      ids: [a.body.data.id, b.body.data.id],
      params: { status: 'inactive' },
    });
    expect(r.status).toBe(200);
    expect(r.body.data.success).toBe(2);
  });
});
