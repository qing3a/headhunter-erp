import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import tagsRouter from '../../src/routes/tags.js';
import candRouter from '../../src/routes/candidates.js';
import { getDb } from '../../src/db/init.js';

setupTests();
const tagsApp = createTestApp('/api/v1/tags', tagsRouter);
const candApp = createTestApp('/api/v1/candidates', candRouter);

async function makeCandidateWithTag(name, tags) {
  const r = await request(candApp).post('/api/v1/candidates').send({ name });
  const cid = r.body.data.id;
  getDb().prepare('INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, ?, ?)').run(cid, JSON.stringify(tags), 1);
  return cid;
}

describe('tags routes (supertest)', () => {
  it('GET /tags 空列表', async () => {
    const r = await request(tagsApp).get('/api/v1/tags');
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBe(0);
  });

  it('GET /tags 列出多候选人聚合', async () => {
    await makeCandidateWithTag('X1', ['React', '前端']);
    await makeCandidateWithTag('X2', ['React', '架构师']);
    const r = await request(tagsApp).get('/api/v1/tags');
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    const react = r.body.data.find(t => t.name === 'React');
    expect(react.count).toBe(2);
  });

  it('GET /tags/:name/candidates 按 tag 查候选人', async () => {
    const cid = await makeCandidateWithTag('Y1', ['Vue']);
    const r = await request(tagsApp).get('/api/v1/tags/Vue/candidates');
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
    expect(r.body.data.find(c => c.id === cid)).toBeDefined();
  });

  it('PUT /tags/:tag/rename 重命名', async () => {
    await makeCandidateWithTag('Z1', ['OldName']);
    const r = await request(tagsApp).put('/api/v1/tags/OldName/rename').send({ new_name: 'NewName' });
    expect(r.status).toBe(200);
    expect(r.body.data.to).toBe('NewName');
    expect(r.body.data.updated).toBeGreaterThanOrEqual(1);
  });

  it('PUT /tags/:tag/rename 缺 new_name → 400', async () => {
    await makeCandidateWithTag('A1', ['TagX']);
    const r = await request(tagsApp).put('/api/v1/tags/TagX/rename').send({});
    expect(r.status).toBe(400);
  });

  it('DELETE /tags/:tag 删 tag', async () => {
    await makeCandidateWithTag('B1', ['TempTag']);
    const r = await request(tagsApp).delete('/api/v1/tags/TempTag');
    expect(r.status).toBe(200);
    expect(r.body.data.removed).toBeGreaterThanOrEqual(1);
  });

  it('POST /tags/merge admin 才能调', async () => {
    await makeCandidateWithTag('C1', ['M1', 'M2']);
    const r = await request(tagsApp).post('/api/v1/tags/merge').send({
      from: ['M1', 'M2'],
      to: 'Merged',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.to).toBe('Merged');
    expect(r.body.data.updated).toBeGreaterThanOrEqual(1);
  });
});
