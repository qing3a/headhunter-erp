// tests/routes/tags-merge-auth.test.js
// v7.5 回归测试：POST /tags/merge 必须是 admin-only
// Bug 3: 原实现 demo 角色可调（应 403）
import { describe, it, expect, beforeAll } from 'vitest';
import { init, isReady } from '../../src/db/init.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('v7.5 tags/merge 鉴权 (Bug 3)', () => {
  it('tags.js /merge 路由加 requireRole("admin") middleware', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/tags.js'),
      'utf8'
    );
    expect(src).toMatch(/router\.post\('\/merge',\s*requireRole\('admin'\)/);
  });

  it('tags.js 顶部 import requireRole from permission middleware', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/tags.js'),
      'utf8'
    );
    expect(src).toMatch(/require\(['"]\.\.\/middleware\/permission['"]\)/);
    expect(src).toMatch(/requireRole/);
  });

  it('permission.js 暴露 requireRole 函数', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/middleware/permission.js'),
      'utf8'
    );
    expect(src).toMatch(/function\s+requireRole/);
    expect(src).toMatch(/module\.exports\s*=\s*\{[^}]*requireRole/);
  });

  // 验证 requireRole 行为：非 admin 应返回 FORBIDDEN ApiError
  it('requireRole("admin") 拒绝非 admin 角色', () => {
    const { requireRole } = require('../../src/middleware/permission.js');
    const { ApiError } = require('../../src/utils/errors.js');
    const middleware = requireRole('admin');
    const req = { user: { role: 'consultant' } };
    let nextCalled = null;
    middleware(req, {}, (err) => { nextCalled = err; });
    expect(nextCalled).toBeInstanceOf(ApiError);
    expect(nextCalled.code).toBe('FORBIDDEN');
  });

  it('requireRole("admin") 放行 admin 角色', () => {
    const { requireRole } = require('../../src/middleware/permission.js');
    const middleware = requireRole('admin');
    const req = { user: { role: 'admin' } };
    let nextCalled = false;
    middleware(req, {}, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('requireRole("admin") 未登录 → UNAUTHORIZED', () => {
    const { requireRole } = require('../../src/middleware/permission.js');
    const { ApiError } = require('../../src/utils/errors.js');
    const middleware = requireRole('admin');
    let nextCalled = null;
    middleware({}, {}, (err) => { nextCalled = err; });
    expect(nextCalled).toBeInstanceOf(ApiError);
    expect(nextCalled.code).toBe('UNAUTHORIZED');
  });
});