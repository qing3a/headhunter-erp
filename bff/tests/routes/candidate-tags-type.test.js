// tests/routes/candidate-tags-type.test.js
// P1-NEW-3 修复：candidate_tags 类型 + 索引测试
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P1-NEW-3: candidate_tags 类型 + 索引', () => {
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
    const ins = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('type_test', 1)`).run();
    testCandId = ins.lastInsertRowid;
  });

  it('idx_candidate_tags_candidate 索引存在', () => {
    const db = getDb();
    const idxs = db.prepare(`PRAGMA index_list(candidate_tags)`).all();
    const idxNames = idxs.map(i => i.name);
    expect(idxNames).toContain('idx_candidate_tags_candidate');
  });

  it('用 number 查 candidate_tags 命中（P0-NEW-2 修复 + 索引生效）', () => {
    const db = getDb();
    const cid = Number(testCandId);
    db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, ?, ?, 0)`)
      .run(cid, '["a"]', 1);
    // 用 number 查询
    const row = db.prepare(`SELECT * FROM candidate_tags WHERE candidate_id = ?`).get(cid);
    expect(row).toBeTruthy();
    expect(row.tags).toBe('["a"]');
  });

  it('candidates.js 不再含 cidStr = String(candidateId)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/candidates.js'),
      'utf8'
    );
    // 期望 PUT /:id/tags 区域不再有 cidStr = String
    expect(src).not.toMatch(/cidStr\s*=\s*String\s*\(\s*candidateId/);
  });
});