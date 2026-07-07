// bff/tests/api/ai-matching.test.js
// v8.1 regression: supertest 覆盖 ai-matching 路由（v8-A 漏掉的 11 路由之一）
// 主要防 P0-新-1：`success` import 路径错误（实际在 ../utils/response，不在 ../utils/errors）

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import { getDb } from '../../src/db/init.js';
import router from '../../src/routes/aiMatching.js';

setupTests();
const app = createTestApp('/api/v1/ai-matching', router);

// 在空 DB 里塞一个 candidate + 两个 job
function seedTestData() {
  const db = getDb();
  const c = db.prepare(`INSERT INTO candidates
    (name, expected_industry, expected_position, expected_city, years_of_experience, education_level, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`).run(
    'AI Match Test', '互联网', 'PM', '北京', 5, 'bachelor'
  );
  const j1 = db.prepare(`INSERT INTO jobs
    (title, industry, city, salary_min, salary_max, education_level, status, owner_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', 1, datetime('now'), datetime('now'))`).run(
    'AI 匹配职位 A', '互联网', '北京', 30, 50, 'bachelor'
  );
  const j2 = db.prepare(`INSERT INTO jobs
    (title, industry, city, salary_min, salary_max, education_level, status, owner_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', 1, datetime('now'), datetime('now'))`).run(
    'AI 匹配职位 B', '金融', '上海', 40, 60, 'master'
  );
  return { cid: Number(c.lastInsertRowid), j1: Number(j1.lastInsertRowid), j2: Number(j2.lastInsertRowid) };
}

describe('ai-matching routes (supertest) - regression for v8-B import bug', () => {
  it('POST /candidate/:id/match → 200 + matches array (regression: success is not a function)', async () => {
    const { cid, j1, j2 } = seedTestData();
    const r = await request(app)
      .post(`/api/v1/ai-matching/candidate/${cid}/match`)
      .send({ job_ids: [j1, j2] });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.data.matches)).toBe(true);
    expect(r.body.data.matches.length).toBe(2);
    expect(r.body.data.candidate_id).toBe(cid);
  });

  it('POST /job/:id/match → 200 + matches array', async () => {
    const { cid, j1 } = seedTestData();
    const r = await request(app)
      .post(`/api/v1/ai-matching/job/${j1}/match`)
      .send({ candidate_ids: [cid] });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.data.matches)).toBe(true);
    expect(r.body.data.matches.length).toBe(1);
    expect(r.body.data.job_id).toBe(j1);
  });

  it('权重参数生效：industry=100 时匹配得分应为 100', async () => {
    const { cid, j1 } = seedTestData();
    const r = await request(app)
      .post(`/api/v1/ai-matching/candidate/${cid}/match`)
      .send({ job_ids: [j1], weights: { industry: 100, position: 0, city: 0, salary: 0, experience: 0, education: 0 } });
    expect(r.status).toBe(200);
    expect(r.body.data.matches[0].score).toBe(100);
  });

  it('不存在的 candidate → 404 NOT_FOUND', async () => {
    const r = await request(app)
      .post('/api/v1/ai-matching/candidate/99999/match')
      .send({});
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });

  it('不存在的 job → 404 NOT_FOUND', async () => {
    const r = await request(app)
      .post('/api/v1/ai-matching/job/99999/match')
      .send({});
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });

  it('无效 candidate id (非数字) → 400 VALIDATION_ERROR', async () => {
    const r = await request(app)
      .post('/api/v1/ai-matching/candidate/abc/match')
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });
});