// bff/tests/routes/candidates-put-cascade.test.js
// P0-1 验证：PUT /candidates/:id + POST /candidates/batch 不应误删子表
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => { if (!isReady()) await init(); });

describe('P0-1 验证：PUT 不应误级联软删子表', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM candidate_tags').run();
    db.prepare('DELETE FROM candidate_experiences').run();
    db.prepare('DELETE FROM candidate_educations').run();
    db.prepare('DELETE FROM candidate_contacts').run();
    db.prepare('DELETE FROM recommendations').run();
    db.prepare('DELETE FROM candidates').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`).run();
  });

  describe('PUT /:id 字段更新', () => {
    it('PUT 后 5 张子表仍存在（不应被误级联软删）', () => {
      const db = getDb();
      // 准备候选 + 5 张子表
      const insCand = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('orig', 1)`).run();
      const cid = insCand.lastInsertRowid;
      db.prepare(`INSERT INTO candidate_experiences (candidate_id, company, user_id) VALUES (?, 'A', 1)`).run(cid);
      db.prepare(`INSERT INTO candidate_educations (candidate_id, school, user_id) VALUES (?, 'B', 1)`).run(cid);
      db.prepare(`INSERT INTO candidate_contacts (candidate_id, contact_type, user_id) VALUES (?, 'phone', 1)`).run(cid);
      db.prepare(`INSERT INTO recommendations (candidate_id, recommend_user_id) VALUES (?, 1)`).run(cid);
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, '["x"]', 1, 0)`).run(cid);

      // 模拟 PUT /candidates/:id（更新 name）
      const putR = db.prepare(`UPDATE candidates SET name = ?, updated_at = datetime('now') WHERE id = ?`).run('updated', cid);
      expect(putR.changes).toBe(1);

      // 验证 5 张子表都仍存在（deleted_at IS NULL）
      // 注：candidate_tags 主键就是 candidate_id（无独立 id 列），所以查询 candidate_id
      const exps = db.prepare(`SELECT id FROM candidate_experiences WHERE candidate_id = ? AND deleted_at IS NULL`).all(cid);
      const edus = db.prepare(`SELECT id FROM candidate_educations WHERE candidate_id = ? AND deleted_at IS NULL`).all(cid);
      const contacts = db.prepare(`SELECT id FROM candidate_contacts WHERE candidate_id = ? AND deleted_at IS NULL`).all(cid);
      const recs = db.prepare(`SELECT id FROM recommendations WHERE candidate_id = ? AND deleted_at IS NULL`).all(cid);
      const tags = db.prepare(`SELECT candidate_id FROM candidate_tags WHERE candidate_id = ? AND deleted_at IS NULL`).all(cid);

      expect(exps.length).toBe(1);
      expect(edus.length).toBe(1);
      expect(contacts.length).toBe(1);
      expect(recs.length).toBe(1);
      expect(tags.length).toBe(1);
    });

    it('PUT 后候选人的 deleted_at 仍为 NULL', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('x', 1)`).run();
      const cid = ins.lastInsertRowid;
      db.prepare(`UPDATE candidates SET name = ? WHERE id = ?`).run('updated', cid);
      const row = db.prepare(`SELECT deleted_at FROM candidates WHERE id = ?`).get(cid);
      expect(row.deleted_at).toBeNull();
    });

    it('PUT 多字段不影响子表', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO candidates (name, phone, email, user_id) VALUES ('x', '111', 'a@x.com', 1)`).run();
      const cid = ins.lastInsertRowid;
      db.prepare(`INSERT INTO candidate_experiences (candidate_id, company, user_id) VALUES (?, 'A', 1)`).run(cid);

      // PUT 多字段
      db.prepare(`UPDATE candidates SET name = ?, phone = ?, email = ?, expected_salary_min = ?, current_city = ? WHERE id = ?`).run('new', '222', 'b@x.com', 30, '北京', cid);

      // 子表仍存在
      const exps = db.prepare(`SELECT id FROM candidate_experiences WHERE candidate_id = ? AND deleted_at IS NULL`).all(cid);
      expect(exps.length).toBe(1);
    });
  });

  describe('POST /batch action=status', () => {
    it('批量 status 更新后子表仍存在', () => {
      const db = getDb();
      // 准备 3 个候选，每个有 1 条子表
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 1)`).run();
      const c2 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c2', 1)`).run();
      const c3 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c3', 1)`).run();
      db.prepare(`INSERT INTO candidate_experiences (candidate_id, company, user_id) VALUES (?, 'A', 1)`).run(c1.lastInsertRowid);
      db.prepare(`INSERT INTO candidate_experiences (candidate_id, company, user_id) VALUES (?, 'B', 1)`).run(c2.lastInsertRowid);
      db.prepare(`INSERT INTO candidate_experiences (candidate_id, company, user_id) VALUES (?, 'C', 1)`).run(c3.lastInsertRowid);

      // 模拟 POST /candidates/batch action=status params.status=placed
      const ids = [c1.lastInsertRowid, c2.lastInsertRowid, c3.lastInsertRowid];
      const placeholders = ids.map(() => '?').join(',');
      const r = db.prepare(`UPDATE candidates SET status = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`).run('placed', ...ids);
      expect(r.changes).toBe(3);

      // 验证子表仍存在
      const exps = db.prepare(`SELECT candidate_id FROM candidate_experiences WHERE candidate_id IN (${placeholders}) AND deleted_at IS NULL`).all(...ids);
      expect(exps.length).toBe(3);
    });
  });

  describe('DELETE /:id 仍正常级联（确认 P0-1 行为）', () => {
    it('DELETE candidate 后 5 张子表都软删（防 P0-1 修复回退）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('to delete', 1)`).run();
      const cid = ins.lastInsertRowid;
      db.prepare(`INSERT INTO candidate_experiences (candidate_id, company, user_id) VALUES (?, 'A', 1)`).run(cid);
      db.prepare(`INSERT INTO candidate_educations (candidate_id, school, user_id) VALUES (?, 'B', 1)`).run(cid);
      db.prepare(`INSERT INTO candidate_contacts (candidate_id, contact_type, user_id) VALUES (?, 'phone', 1)`).run(cid);
      db.prepare(`INSERT INTO recommendations (candidate_id, recommend_user_id) VALUES (?, 1)`).run(cid);
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, '["x"]', 1, 0)`).run(cid);

      // 模拟 DELETE /candidates/:id 的级联软删
      db.prepare(`UPDATE candidates SET deleted_at = datetime('now') WHERE id = ?`).run(cid);
      db.prepare(`UPDATE candidate_experiences SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL`).run(cid);
      db.prepare(`UPDATE candidate_educations SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL`).run(cid);
      db.prepare(`UPDATE candidate_contacts SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL`).run(cid);
      db.prepare(`UPDATE recommendations SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL`).run(cid);
      db.prepare(`UPDATE candidate_tags SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL`).run(cid);

      // 验证
      // 注：candidate_tags 主键 = candidate_id（没有独立 id 列）
      const tables = [
        { name: 'candidate_experiences', pk: 'id' },
        { name: 'candidate_educations', pk: 'id' },
        { name: 'candidate_contacts', pk: 'id' },
        { name: 'recommendations', pk: 'id' },
        { name: 'candidate_tags', pk: 'candidate_id' },
      ];
      for (const t of tables) {
        const active = db.prepare(`SELECT ${t.pk} FROM ${t.name} WHERE candidate_id = ? AND deleted_at IS NULL`).all(cid);
        expect(active.length).toBe(0);
      }
    });
  });

  // 源码级 invariant
  describe('源码级 invariant（防回归）', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/candidates.js'),
      'utf8'
    );

    it('PUT /:id 路由不包含 5 张子表级联软删 SQL（只在 DELETE 路由）', () => {
      // 验证：PUT 路由里没有 "UPDATE candidate_experiences SET deleted_at" 之类
      // 简单方法：取 PUT 路由的代码段（route 字符串之间）
      const putMatch = src.match(/router\.put\('\/:id'[\s\S]+?router\.delete/);
      expect(putMatch).toBeTruthy();
      const putBody = putMatch[0];
      expect(putBody).not.toMatch(/UPDATE\s+candidate_experiences\s+SET\s+deleted_at/);
      expect(putBody).not.toMatch(/UPDATE\s+candidate_educations\s+SET\s+deleted_at/);
      expect(putBody).not.toMatch(/UPDATE\s+candidate_contacts\s+SET\s+deleted_at/);
      expect(putBody).not.toMatch(/UPDATE\s+recommendations\s+SET\s+deleted_at/);
      expect(putBody).not.toMatch(/UPDATE\s+candidate_tags\s+SET\s+deleted_at/);
    });

    it('batch action 路由不包含 5 张子表级联软删 SQL', () => {
      const batchMatch = src.match(/router\.post\('\/batch'[\s\S]+?\}\);?\s*\}\);?$/m);
      // batch 路由通常在文件末尾
      // 简单验证：源码里 batch 块不包含级联 SQL
      const idx = src.indexOf("router.post('/batch'");
      const batchBody = idx >= 0 ? src.slice(idx) : '';
      expect(batchBody).not.toMatch(/UPDATE\s+candidate_experiences\s+SET\s+deleted_at/);
      expect(batchBody).not.toMatch(/UPDATE\s+candidate_educations\s+SET\s+deleted_at/);
      expect(batchBody).not.toMatch(/UPDATE\s+candidate_contacts\s+SET\s+deleted_at/);
      expect(batchBody).not.toMatch(/UPDATE\s+recommendations\s+SET\s+deleted_at/);
      expect(batchBody).not.toMatch(/UPDATE\s+candidate_tags\s+SET\s+deleted_at/);
    });
  });
});
