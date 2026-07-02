import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import router from '../../src/routes/interviews.js';

setupTests();
const app = createTestApp('/api/v1/interviews', router);

describe('interviews routes (supertest)', () => {
  it('GET /interviews 空列表', async () => {
    const r = await request(app).get('/api/v1/interviews');
    expect(r.status).toBe(200);
    expect(r.body.meta.total).toBe(0);
  });

  it('POST /interviews 创建', async () => {
    const r = await request(app).post('/api/v1/interviews').send({
      candidate_name: '候选张三',
      job_title: '前端',
      scheduled_at: '2026-08-01 10:00:00',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBeGreaterThan(0);
    expect(r.body.data.candidate_name).toBe('候选张三');
  });

  it('POST /interviews 缺候选人姓名 → 400', async () => {
    const r = await request(app).post('/api/v1/interviews').send({ job_title: 'X' });
    expect(r.status).toBe(400);
  });

  it('GET /interviews/:id 详情', async () => {
    const c = await request(app).post('/api/v1/interviews').send({ candidate_name: 'Det' });
    const id = c.body.data.id;
    const r = await request(app).get(`/api/v1/interviews/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(id);
  });

  it('PUT /interviews/:id 更新', async () => {
    const c = await request(app).post('/api/v1/interviews').send({ candidate_name: 'U' });
    const id = c.body.data.id;
    const r = await request(app).put(`/api/v1/interviews/${id}`).send({ status: 'completed', note: '面完了' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('completed');
    expect(r.body.data.note).toBe('面完了');
  });

  it('DELETE /interviews/:id 软删', async () => {
    const c = await request(app).post('/api/v1/interviews').send({ candidate_name: 'D' });
    const id = c.body.data.id;
    const r = await request(app).delete(`/api/v1/interviews/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.deleted).toBe(true);
    const g = await request(app).get(`/api/v1/interviews/${id}`);
    expect(g.status).toBe(404);
  });

  it('GET /interviews/:id 不存在 → 404', async () => {
    const r = await request(app).get('/api/v1/interviews/99999');
    expect(r.status).toBe(404);
  });
});
