// bff/tests/routes/reports-sql.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { init, isReady } from '../../src/db/init.js';
import fs from 'fs';
import path from 'path';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P1-NEW-1: reports.js SQL 参数化', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/routes/reports.js'),
    'utf8'
  );

  it('reports.js 不应含 user_id 直接拼接的 SQL', () => {
    // 不应有 `user_id = <something>` 紧跟 `+` 的字符串拼接
    expect(src).not.toMatch(/recommend_user_id\s*=\s*['"]?\s*\+/);
    expect(src).not.toMatch(/user_id\s*=\s*['"]?\s*\+/);
  });

  it('reports.js funnel/consultant-performance 路由存在', () => {
    expect(src).toContain("router.get('/funnel'");
    expect(src).toContain("router.get('/consultant-performance'");
  });

  it('reports.js 使用 ? 占位符', () => {
    // 至少应有一处 'recommend_user_id = ?'
    expect(src).toContain('recommend_user_id = ?');
  });
});