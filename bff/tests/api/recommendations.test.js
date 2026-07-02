import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import recsRouter from '../../src/routes/recommendations.js';
import candRouter from '../../src/routes/candidates.js';
import jobsRouter from '../../src/routes/jobs.js';
import { getDb } from '../../src/db/init.js';

setupTests();
const app = createTestApp('/api/v1/recommendations', recsRouter);
const candApp = createTestApp('/api/v1/candidates', candRouter);
const jobsApp = createTestApp('/api/v1/jobs', jobsRouter);

async function makeCandidate(name = '测试候选人') {
  const r = await request(candApp).post('/api/v1/candidates').send({ name });
  return r.body.data.id;
}

async function makeJob(title = '测试职位') {
  const r = await request(jobsApp).post('/api/v1/jobs').send({ title });
  return r.body.data.id;
}

describe('recommendations routes (supertest)', () => {
  it('GET /recommendations 空列表', async () => {
    const r = await request(app).get('/api/v1/recommendations');
    expect(r.status).toBe(200);
    expect(r.body.meta.total).toBe(0);
  });

  it('POST /recommendations 创建', async () => {
    const cid = await makeCandidate('候选-A');
    const r = await request(app).post('/api/v1/recommendations').send({
      candidate_id: cid,
      client_name: '客户X',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBeGreaterThan(0);
    expect(r.body.data.candidate_id).toBe(cid);
  });

  it('POST /recommendations 缺 candidate_id → 400', async () => {
    const r = await request(app).post('/api/v1/recommendations').send({ client_name: 'X' });
    expect(r.status).toBe(400);
  });

  it('POST /recommendations/:id/status 合法状态流转', async () => {
    const cid = await makeCandidate('候选-B');
    const c = await request(app).post('/api/v1/recommendations').send({ candidate_id: cid });
    const id = c.body.data.id;
    const r = await request(app).post(`/api/v1/recommendations/${id}/status`).send({
      to_status: 'pending_feedback',
      note: '客户反馈中',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('pending_feedback');
  });

  it('POST /recommendations/:id/status 非法状态值 → 400', async () => {
    const cid = await makeCandidate('候选-C');
    const c = await request(app).post('/api/v1/recommendations').send({ candidate_id: cid });
    const id = c.body.data.id;
    const r = await request(app).post(`/api/v1/recommendations/${id}/status`).send({
      to_status: 'not_a_real_status',
    });
    expect(r.status).toBe(400);
  });

  it('GET /recommendations/overdue 列 overdue 推荐', async () => {
    const cid = await makeCandidate('候选-D');
    const c = await request(app).post('/api/v1/recommendations').send({ candidate_id: cid });
    const id = c.body.data.id;
    // 直接 UPDATE 把 recommend_at 改成 5 天前（绕开 scan）
    getDb().prepare("UPDATE recommendations SET recommend_at = datetime('now', '-5 days') WHERE id = ?").run(id);
    const r = await request(app).get('/api/v1/recommendations/overdue');
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /recommendations/scan-overdue 手动扫（admin）', async () => {
    const cid = await makeCandidate('候选-E');
    await request(app).post('/api/v1/recommendations').send({ candidate_id: cid });
    const r = await request(app).post('/api/v1/recommendations/scan-overdue');
    expect(r.status).toBe(200);
    expect(typeof r.body.data.processed).toBe('number');
  });

  it('DELETE /recommendations/:id 软删', async () => {
    const cid = await makeCandidate('候选-F');
    const c = await request(app).post('/api/v1/recommendations').send({ candidate_id: cid });
    const id = c.body.data.id;
    const r = await request(app).delete(`/api/v1/recommendations/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.deleted).toBe(true);
  });

  it('PUT /recommendations/:id 更新基本信息', async () => {
    const cid = await makeCandidate('候选-G');
    const c = await request(app).post('/api/v1/recommendations').send({ candidate_id: cid });
    const id = c.body.data.id;
    const r = await request(app).put(`/api/v1/recommendations/${id}`).send({
      notes: '二次沟通',
      client_name: '客户Y',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.notes).toBe('二次沟通');
    expect(r.body.data.client_name).toBe('客户Y');
  });

  it('POST /recommendations closed job 不能推荐', async () => {
    const cid = await makeCandidate('候选-H');
    // 先建一个 closed 职位
    const j = await request(jobsApp).post('/api/v1/jobs').send({ title: 'Closed Job', status: 'closed' });
    const r = await request(app).post('/api/v1/recommendations').send({
      candidate_id: cid,
      job_id: j.body.data.id,
    });
    expect(r.status).toBe(400);
  });
});
