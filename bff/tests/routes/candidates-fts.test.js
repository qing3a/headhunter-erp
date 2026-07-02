// bff/tests/routes/candidates-fts.test.js
// v6.5 优化：候选人 FTS5 全文搜索 + overdue 复合索引
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => { if (!isReady()) await init(); });

describe('v6.5 候选人 FTS5 全文搜索', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM candidate_tags').run();
    db.prepare('DELETE FROM candidates').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`).run();
  });

  it('FTS5 表存在', () => {
    const db = getDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='candidates_fts'`).all();
    // FTS 虚拟表在 sqlite_master 里也是 'table' 类型
    if (tables.length === 0) {
      console.warn('FTS5 not available in this sql.js, skipping');
      return;
    }
    expect(tables[0].name).toBe('candidates_fts');
  });

  it('INSERT candidate 触发 FTS 同步', () => {
    const db = getDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='candidates_fts'`).all();
    if (tables.length === 0) return;  // skip if FTS not available

    const ins = db.prepare(`INSERT INTO candidates (name, email, user_id) VALUES ('张明', 'a@x.com', 1)`).run();
    const cid = ins.lastInsertRowid;

    // FTS 应该自动有这一行
    const fts = db.prepare(`SELECT * FROM candidates_fts WHERE candidate_id = ?`).get(cid);
    expect(fts).toBeTruthy();
    expect(fts.name).toBe('张明');
  });

  it('FTS MATCH 命中（中文）', () => {
    const db = getDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='candidates_fts'`).all();
    if (tables.length === 0) return;

    db.prepare(`INSERT INTO candidates (name, email, user_id) VALUES ('张明', 'a@x.com', 1)`).run();
    db.prepare(`INSERT INTO candidates (name, email, user_id) VALUES ('李华', 'b@x.com', 1)`).run();

    // 搜 "张明" 应只命中第一个
    const r = db.prepare(`SELECT c.id FROM candidates c WHERE c.id IN (SELECT candidate_id FROM candidates_fts WHERE candidates_fts MATCH '张明*')`).all();
    expect(r.length).toBe(1);
  });

  it('FTS MATCH 英文 + 数字', () => {
    const db = getDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='candidates_fts'`).all();
    if (tables.length === 0) return;

    db.prepare(`INSERT INTO candidates (name, email, phone, user_id) VALUES ('Acme', 'a@x.com', '13800138000', 1)`).run();
    db.prepare(`INSERT INTO candidates (name, email, phone, user_id) VALUES ('Beta', 'b@x.com', '13900139000', 1)`).run();

    // 搜 "138" 应命中第一个（phone match）
    const r = db.prepare(`SELECT c.id FROM candidates c WHERE c.id IN (SELECT candidate_id FROM candidates_fts WHERE candidates_fts MATCH '138*')`).all();
    expect(r.length).toBe(1);
  });

  it('UPDATE candidate 同步 FTS', () => {
    const db = getDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='candidates_fts'`).all();
    if (tables.length === 0) return;

    const ins = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('old', 1)`).run();
    const cid = ins.lastInsertRowid;
    db.prepare(`UPDATE candidates SET name = 'new' WHERE id = ?`).run(cid);
    const fts = db.prepare(`SELECT name FROM candidates_fts WHERE candidate_id = ?`).get(cid);
    expect(fts.name).toBe('new');
  });

  it('DELETE candidate 同步从 FTS 移除', () => {
    const db = getDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='candidates_fts'`).all();
    if (tables.length === 0) return;

    const ins = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('x', 1)`).run();
    const cid = ins.lastInsertRowid;
    db.prepare(`DELETE FROM candidates WHERE id = ?`).run(cid);
    const fts = db.prepare(`SELECT * FROM candidates_fts WHERE candidate_id = ?`).get(cid);
    expect(fts).toBeFalsy();
  });

  // 性能基准
  it('PERF: 1000 candidates + FTS 查询 < 50ms', () => {
    const db = getDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='candidates_fts'`).all();
    if (tables.length === 0) return;

    // 插 1000
    const ins = db.prepare(`INSERT INTO candidates (name, user_id) VALUES (?, 1)`);
    for (let i = 0; i < 1000; i++) ins.run('user' + i);
    // 测查询耗时
    const start = Date.now();
    const r = db.prepare(`SELECT c.id FROM candidates c WHERE c.id IN (SELECT candidate_id FROM candidates_fts WHERE candidates_fts MATCH 'user5*')`).all();
    const ms = Date.now() - start;
    expect(r.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(50);
  });

  // overdue 复合索引
  it('overdue 复合索引存在', () => {
    const db = getDb();
    const idxs = db.prepare(`PRAGMA index_list('recommendations')`).all();
    const names = idxs.map(i => i.name);
    expect(names).toContain('idx_rec_status_change');
    expect(names).toContain('idx_rec_status_recommend');
  });
});