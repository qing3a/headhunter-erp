// tests/routes/tags-instr.test.js
// P1-NEW-8 修复：tags.js 用 instr 精确匹配（避免 LIKE 子串误匹配）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P1-NEW-8: tags.js 用 instr 精确匹配（避免子串误匹配）', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM candidate_tags').run();
    db.prepare('DELETE FROM candidates').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 't', 'x', 'consultant')`).run();
  });

  it('instr 匹配：tag "前端" 不会误中 "前后端"', () => {
    const db = getDb();
    // 两个候选人
    const a = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('a', 1)`).run();
    const b = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('b', 1)`).run();
    // a 的 tags 含 "前端"（应被命中）
    db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, ?, 1)`).run(a.lastInsertRowid, '["前端","Vue"]');
    // b 的 tags 含 "前后端"（不应被命中）
    db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, ?, 1)`).run(b.lastInsertRowid, '["前后端"]');

    // 用 instr 查 "前端"
    const r1 = db.prepare(`SELECT candidate_id FROM candidate_tags WHERE instr(tags, ?) > 0`).get('"前端"');
    expect(r1).toBeTruthy();
    expect(r1.candidate_id).toBe(a.lastInsertRowid);  // 命中 a，不命中 b

    // 用 instr 查 "前后端"
    const r2 = db.prepare(`SELECT candidate_id FROM candidate_tags WHERE instr(tags, ?) > 0`).get('"前后端"');
    expect(r2).toBeTruthy();
    expect(r2.candidate_id).toBe(b.lastInsertRowid);
  });

  it('LIKE 子串匹配有问题（保留作为 regression）: LIKE 是 case-insensitive 且 _ 是通配符', () => {
    const db = getDb();
    const a = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('a', 1)`).run();
    const b = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('b', 1)`).run();
    const c = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c', 1)`).run();
    const d = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('d', 1)`).run();
    db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, ?, 1)`).run(a.lastInsertRowid, '["vip"]');
    db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, ?, 1)`).run(b.lastInsertRowid, '["VIP"]');
    // 演示 _ 是 LIKE 通配符
    db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, ?, 1)`).run(c.lastInsertRowid, '["a_b"]');
    db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, ?, 1)`).run(d.lastInsertRowid, '["axb"]');

    // sql.js LIKE 是 case-insensitive：搜 "vip" 会同时命中 "vip" 和 "VIP"（bug）
    const likeRows = db.prepare(`SELECT candidate_id FROM candidate_tags WHERE tags LIKE ?`).all('%"vip"%');
    expect(likeRows.length).toBe(2);  // LIKE 的 case-insensitive bug

    // sql.js _ 是通配符：搜 "a_b" 会同时命中 "a_b" 和 "axb"（bug）
    const likeRows2 = db.prepare(`SELECT candidate_id FROM candidate_tags WHERE tags LIKE ?`).all('%"a_b"%');
    expect(likeRows2.length).toBe(2);  // LIKE 的 _ 通配符 bug

    // instr 是精确大小写敏感匹配
    const instrRows = db.prepare(`SELECT candidate_id FROM candidate_tags WHERE instr(tags, ?) > 0`).all('"vip"');
    expect(instrRows.length).toBe(1);  // 只命中 "vip"，不命中 "VIP"
  });

  it('tags.js 源码不再含 tags LIKE ?', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/tags.js'),
      'utf8'
    );
    // 期望源码不再用 tags LIKE
    expect(src).not.toMatch(/tags\s+LIKE\s+\?/);
  });

  it('tags.js 源码使用 instr', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/tags.js'),
      'utf8'
    );
    expect(src).toContain('instr(tags');
  });
});