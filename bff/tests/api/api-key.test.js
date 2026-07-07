// bff/tests/api/api-key.test.js
// v9.0-gamma: API Key 鉴权 supertest
// 覆盖：issue → validate → revoke → 无 auth → 错误 key → JWT 仍可用 → last_used_at

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupTests } from './_helpers.js';
import { getDb } from '../../src/db/init.js';
import candidatesRouter from '../../src/routes/candidates.js';
import bcrypt from 'bcryptjs';

setupTests();

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/candidates', candidatesRouter);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      ok: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message },
    });
  });
  return app;
}

function makeKey({ client = 'test-client', scopes = [], user_id = null, revoked = false } = {}) {
  const db = getDb();
  const raw = `hha_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const prefix = raw.slice(0, 8);
  const hashed = bcrypt.hashSync(raw, 4);
  db.prepare(`INSERT INTO api_keys (client_name, key_prefix, hashed_key, scopes, user_id, revoked_at)
              VALUES (?, ?, ?, ?, ?, ?)`).run(
    client, prefix, hashed, JSON.stringify(scopes), user_id,
    revoked ? new Date().toISOString() : null
  );
  return raw;
}

describe('API Key auth (v9.0-gamma)', () => {
  it('1. 有效 ApiKey → 200 + 列表返数据', async () => {
    const app = makeApp();
    const key = makeKey({ scopes: [] });
    const r = await request(app).get('/api/v1/candidates').set('Authorization', `ApiKey ${key}`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.data)).toBe(true);
  });

  it('2. 无 Authorization → 401 NO_TOKEN', async () => {
    const app = makeApp();
    const r = await request(app).get('/api/v1/candidates');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('NO_TOKEN');
  });

  it('3. 错误 ApiKey → 401 INVALID_TOKEN', async () => {
    const app = makeApp();
    const r = await request(app).get('/api/v1/candidates').set('Authorization', 'ApiKey wrong-key-123456789012345678901234567890');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_TOKEN');
  });

  it('4. 已撤销 ApiKey → 401 INVALID_TOKEN', async () => {
    const app = makeApp();
    const key = makeKey({ revoked: true });
    const r = await request(app).get('/api/v1/candidates').set('Authorization', `ApiKey ${key}`);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_TOKEN');
  });

  it('5. Bearer JWT 仍能用 (向后兼容)', async () => {
    const app = makeApp();
    // 这里手动 login admin 拿 JWT, 然后用 Bearer 调
    const loginR = await request(app)
      .post('/api/v1/auth/login')
      .set('Host', '127.0.0.1')
      .send({ username: 'admin', password: 'admin123' });
    // 这个 app 没有 auth router, 所以 login 会 404 — 跳过 login, 直接构造一个 token in-process:
    const jwt = await import('jsonwebtoken');
    const { getConfig } = await import('../../src/config/env.js');
    const { jwtSecret } = getConfig();
    const token = jwt.default.sign({ id: 1, username: 'admin', role: 'admin' }, jwtSecret);
    const r = await request(app).get('/api/v1/candidates?page=1&pageSize=1').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('6. 有效 ApiKey 命中后 last_used_at 被更新', async () => {
    const app = makeApp();
    const db = getDb();
    const key = makeKey();
    const prefix = key.slice(0, 8);

    const before = db.prepare('SELECT last_used_at FROM api_keys WHERE key_prefix = ?').get(prefix);
    expect(before.last_used_at).toBeNull();

    await request(app).get('/api/v1/candidates').set('Authorization', `ApiKey ${key}`);

    const after = db.prepare('SELECT last_used_at FROM api_keys WHERE key_prefix = ?').get(prefix);
    expect(after.last_used_at).not.toBeNull();
  });
});
