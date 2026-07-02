import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import dashboardRouter from '../../src/routes/dashboard.js';
import interviewRouter from '../../src/routes/interviews.js';
import taskRouter from '../../src/routes/tasks.js';
import { getDb } from '../../src/db/init.js';

setupTests();
const app = createTestApp('/api/v1/dashboard', dashboardRouter);
const intvApp = createTestApp('/api/v1/interviews', interviewRouter);
const taskApp = createTestApp('/api/v1/tasks', taskRouter);

describe('dashboard routes (supertest)', () => {
  it('GET /dashboard/stats 空数据库', async () => {
    const r = await request(app).get('/api/v1/dashboard/stats');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(typeof r.body.data.interviews_count).toBe('number');
    expect(typeof r.body.data.pending_tasks).toBe('number');
    expect(typeof r.body.data.completed_tasks).toBe('number');
  });

  it('GET /dashboard/stats 有数据', async () => {
    await request(intvApp).post('/api/v1/interviews').send({ candidate_name: 'X' });
    await request(taskApp).post('/api/v1/tasks').send({ title: 'Follow up' });

    const r = await request(app).get('/api/v1/dashboard/stats');
    expect(r.status).toBe(200);
    expect(r.body.data.interviews_count).toBeGreaterThanOrEqual(1);
    expect(r.body.data.pending_tasks).toBeGreaterThanOrEqual(1);
  });
});
