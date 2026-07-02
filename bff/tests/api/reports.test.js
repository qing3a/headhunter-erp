import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import router from '../../src/routes/reports.js';

setupTests();
const app = createTestApp('/api/v1/reports', router);

describe('reports routes (supertest)', () => {
  it('GET /reports/kpi 空数据库返 KPI', async () => {
    const r = await request(app).get('/api/v1/reports/kpi');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(typeof r.body.data.totalCandidates).toBe('number');
    expect(typeof r.body.data.monthlyRecommendations).toBe('number');
    expect(typeof r.body.data.activeInterviews).toBe('number');
    expect(typeof r.body.data.monthlyHires).toBe('number');
  });

  it('GET /reports/funnel 返漏斗 stages', async () => {
    const r = await request(app).get('/api/v1/reports/funnel');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.stages)).toBe(true);
    expect(r.body.data.stages.length).toBe(4);
    expect(r.body.data.stages[0].key).toBe('recommended');
  });

  it('GET /reports/consultant-performance 返 top 10', async () => {
    const r = await request(app).get('/api/v1/reports/consultant-performance');
    expect(r.status).toBe(200);
    expect(typeof r.body.data.days).toBe('number');
    expect(Array.isArray(r.body.data.consultants)).toBe(true);
  });

  it('GET /reports/status-distribution 返状态分布', async () => {
    const r = await request(app).get('/api/v1/reports/status-distribution');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
  });
});
