import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, setupTests } from './_helpers.js';
import router from '../../src/routes/auth.js';

setupTests();
// auth.js: 部分路径要 admin（POST /register, GET /users, GET /audit-log）
// 部分要登录（GET /me, /change-password, /users/:id）
// 默认 mock auth 为 admin，可以一文件搞定
const app = createTestApp('/api/v1/auth', router);

describe('auth routes (supertest)', () => {
  it('POST /login admin → 200 + token + user', async () => {
    const r = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.data.token).toBeDefined();
    expect(r.body.data.user.role).toBe('admin');
  });

  it('POST /login 错密码 → 401', async () => {
    const r = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
  });

  it('POST /login 缺字段 → 400', async () => {
    const r = await request(app).post('/api/v1/auth/login').send({ username: 'admin' });
    expect(r.status).toBe(400);
  });

  it('GET /me → 返 current user info', async () => {
    const r = await request(app).get('/api/v1/auth/me');
    expect(r.status).toBe(200);
    expect(r.body.data.username).toBe('admin');
    expect(r.body.data.role).toBe('admin');
  });

  it('POST /change-password 旧密码错 → 400', async () => {
    const r = await request(app).post('/api/v1/auth/change-password').send({
      old_password: 'wrong',
      new_password: 'newpass123',
    });
    expect(r.status).toBe(400);
  });

  it('POST /change-password 成功', async () => {
    const r = await request(app).post('/api/v1/auth/change-password').send({
      old_password: 'admin123',
      new_password: 'newpass123',
    });
    expect(r.status).toBe(200);
  });

  it('GET /users admin 可查看', async () => {
    const r = await request(app).get('/api/v1/auth/users');
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /register admin 成功', async () => {
    const r = await request(app).post('/api/v1/auth/register').send({
      username: 'newuser',
      password: 'pass123',
      displayName: 'New User',
      role: 'consultant',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.username).toBe('newuser');
  });

  it('GET /audit-log admin 可查', async () => {
    const r = await request(app).get('/api/v1/auth/audit-log?action=LOGIN');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
  });
});
