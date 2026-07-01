// tests/routes/tags-lock.test.js
// P0-NEW-2 修复：candidate_tags 乐观锁（version 列）测试
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('candidate_tags optimistic lock', () => {
  let testCandId;

  beforeEach(() => {
    const db = getDb();
    // 确保存在测试用户（candidates.user_id 有 NOT NULL 约束/外键）
    const userExists = db.prepare(`SELECT id FROM users WHERE id = 1`).get();
    if (!userExists) {
      db.prepare(`INSERT INTO users (id, username, password_hash) VALUES (1, 'tester', 'x')`).run();
    }
    db.prepare('DELETE FROM candidate_tags').run();
    db.prepare('DELETE FROM candidates').run();
    const ins = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('lock_test', 1)`).run();
    testCandId = ins.lastInsertRowid;
  });

  it('version 列应存在于 candidate_tags 表中（ALTER 加列）', () => {
    const db = getDb();
    const cols = db.prepare(`PRAGMA table_info(candidate_tags)`).all();
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('version');
  });

  it('version 0 时第一次 UPDATE 成功，version+1', () => {
    const db = getDb();
    db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, ?, ?, 0)`)
      .run(testCandId, '["a"]', 1);

    const r1 = db.prepare(`UPDATE candidate_tags SET tags=?, version=version+1 WHERE candidate_id=? AND version=0`)
      .run('["b"]', testCandId);
    expect(r1.changes).toBe(1);

    const row = db.prepare(`SELECT version FROM candidate_tags WHERE candidate_id = ?`).get(testCandId);
    expect(row.version).toBe(1);
  });

  it('并发 UPDATE 同 version 第二次应失败（changes=0）', () => {
    const db = getDb();
    db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, ?, ?, 0)`)
      .run(testCandId, '["a"]', 1);

    // 模拟两个并发 PUT，都基于 version=0
    const r1 = db.prepare(`UPDATE candidate_tags SET tags=?, version=version+1 WHERE candidate_id=? AND version=0`)
      .run('["b"]', testCandId);
    const r2 = db.prepare(`UPDATE candidate_tags SET tags=?, version=version+1 WHERE candidate_id=? AND version=0`)
      .run('["c"]', testCandId);

    expect(r1.changes).toBe(1);
    expect(r2.changes).toBe(0);  // 第二个被乐观锁拒绝
  });
});
