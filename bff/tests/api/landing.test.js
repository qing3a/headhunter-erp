// bff/tests/api/landing.test.js
// v9.0-beta: GET / 应返 API hub metadata JSON

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import router from '../../src/routes/landing.js';

setupTests();
const app = createTestApp('/', router);

describe('landing route (supertest)', () => {
  it('GET / → 200 + JSON with version + docs URL', async () => {
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.data.name).toBe('headhunter-api-hub');
    expect(r.body.data.version).toMatch(/^9\./);
    expect(r.body.data.api.docs).toBe('/api/docs');
    expect(r.body.data.api.openapi).toBe('/api/v1/openapi.json');
    expect(r.body.data.api.health).toBe('/api/v1/health');
  });

  it('GET / 包含 auth methods + timestamp', async () => {
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(r.body.data.auth.methods).toEqual(
      expect.arrayContaining([
        expect.stringContaining('JWT'),
        expect.stringContaining('ApiKey'),
      ])
    );
    expect(typeof r.body.data.timestamp).toBe('string');
    // timestamp 是 ISO 8601
    expect(() => new Date(r.body.data.timestamp).toISOString()).not.toThrow();
  });
});
