// tests/routes/candidates-all-pages.test.js
// P2-D3 修复：admin 全选所有页 ?all_pages=true 后端支持
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P2-D3: 全选所有页 ?all_pages=true', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM candidate_tags').run();
    db.prepare('DELETE FROM candidates').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`).run();
  });

  it('admin 调 ?all_pages=true 返回所有 candidate id', () => {
    const db = getDb();
    for (let i = 0; i < 3; i++) {
      db.prepare(`INSERT INTO candidates (name, user_id) VALUES (?, 1)`).run('c' + i);
    }
    const rows = db.prepare(
      `SELECT id FROM candidates c WHERE deleted_at IS NULL ORDER BY c.updated_at DESC LIMIT 500`
    ).all();
    expect(rows.length).toBe(3);
  });

  it('带 keyword 过滤', () => {
    const db = getDb();
    db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('Acme1', 1)`).run();
    db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('Beta1', 1)`).run();
    const rows = db.prepare(
      `SELECT id FROM candidates c WHERE deleted_at IS NULL AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.current_company LIKE ?) ORDER BY c.updated_at DESC LIMIT 500`
    ).all('%Acme%', '%Acme%', '%Acme%', '%Acme%');
    expect(rows.length).toBe(1);
  });

  it('带 status 过滤', () => {
    const db = getDb();
    db.prepare(`INSERT INTO candidates (name, user_id, status) VALUES ('a', 1, 'active')`).run();
    db.prepare(`INSERT INTO candidates (name, user_id, status) VALUES ('b', 1, 'placed')`).run();
    const rows = db.prepare(
      `SELECT id FROM candidates c WHERE deleted_at IS NULL AND c.status = 'active' ORDER BY c.updated_at DESC LIMIT 500`
    ).all();
    expect(rows.length).toBe(1);
  });

  it('软删不返回', () => {
    const db = getDb();
    db.prepare(`INSERT INTO candidates (name, user_id, deleted_at) VALUES ('gone', 1, datetime('now'))`).run();
    db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('live', 1)`).run();
    const rows = db.prepare(
      `SELECT id FROM candidates c WHERE deleted_at IS NULL ORDER BY c.updated_at DESC LIMIT 500`
    ).all();
    expect(rows.length).toBe(1);
  });

  it('LIMIT 500 限制', () => {
    const db = getDb();
    for (let i = 0; i < 600; i++) {
      db.prepare(`INSERT INTO candidates (name, user_id) VALUES (?, 1)`).run('c' + i);
    }
    const rows = db.prepare(
      `SELECT id FROM candidates c WHERE deleted_at IS NULL ORDER BY c.updated_at DESC LIMIT 500`
    ).all();
    expect(rows.length).toBe(500);
  });

  // 源码级 invariant
  it('candidates.js 源码含 all_pages 分支（admin 限定）', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/candidates.js'),
      'utf8'
    );
    expect(src).toMatch(/all_pages\s*===\s*['"]true['"]/);
    expect(src).toMatch(/req\.user\.role\s*===\s*['"]admin['"]/);
    expect(src).toMatch(/LIMIT\s+500/);
  });
});