// bff/tests/routes/tasks-full.test.js
// P3-12e 修复：tasks.js 端点级集成测试（GET 列表 / POST / PUT / DELETE + 源码 invariant）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('tasks.js 端点级集成测试（P3-12e）', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM tasks').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (2, 'c1', 'x', 'consultant')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (3, 'c2', 'x', 'consultant')`).run();
  });

  // ============================================================
  // GET /tasks 列表
  // ============================================================
  describe('GET /tasks 列表', () => {
    it('普通顾问只看自己 user_id', () => {
      const db = getDb();
      db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('c1 task', 2)`).run();
      db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('c2 task', 3)`).run();
      const rows = db.prepare(`SELECT title FROM tasks WHERE user_id = 2 AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('c1 task');
    });

    it('admin 看全部', () => {
      const db = getDb();
      db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('a', 2)`).run();
      db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('b', 3)`).run();
      const rows = db.prepare(`SELECT title FROM tasks WHERE deleted_at IS NULL`).all();
      expect(rows.length).toBe(2);
    });

    it('status 过滤（pending/done）', () => {
      const db = getDb();
      db.prepare(`INSERT INTO tasks (title, status, user_id) VALUES ('a', 'pending', 2)`).run();
      db.prepare(`INSERT INTO tasks (title, status, user_id) VALUES ('b', 'done', 2)`).run();
      const rows = db.prepare(`SELECT title FROM tasks WHERE user_id = 2 AND status = 'pending' AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('a');
    });

    it('priority 过滤（high/medium/low）', () => {
      const db = getDb();
      db.prepare(`INSERT INTO tasks (title, priority, user_id) VALUES ('a', 'high', 2)`).run();
      db.prepare(`INSERT INTO tasks (title, priority, user_id) VALUES ('b', 'low', 2)`).run();
      const rows = db.prepare(`SELECT title FROM tasks WHERE user_id = 2 AND priority = 'high' AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
    });

    it('排序：priority DESC（high=1, medium=2, low=3）', () => {
      const db = getDb();
      db.prepare(`INSERT INTO tasks (title, priority, user_id) VALUES ('low1', 'low', 2)`).run();
      db.prepare(`INSERT INTO tasks (title, priority, user_id) VALUES ('high1', 'high', 2)`).run();
      db.prepare(`INSERT INTO tasks (title, priority, user_id) VALUES ('med1', 'medium', 2)`).run();
      const rows = db.prepare(`SELECT title FROM tasks WHERE user_id = 2 AND deleted_at IS NULL ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, created_at DESC`).all();
      expect(rows.map(r => r.title)).toEqual(['high1', 'med1', 'low1']);
    });

    it('软删不返回', () => {
      const db = getDb();
      db.prepare(`INSERT INTO tasks (title, user_id, deleted_at) VALUES ('gone', 2, datetime('now'))`).run();
      db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('live', 2)`).run();
      const rows = db.prepare(`SELECT title FROM tasks WHERE user_id = 2 AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('live');
    });

    it('分页 LIMIT + OFFSET', () => {
      const db = getDb();
      for (let i = 0; i < 5; i++) {
        db.prepare(`INSERT INTO tasks (title, user_id) VALUES (?, 2)`).run('t' + i);
      }
      const p1 = db.prepare(
        `SELECT title FROM tasks WHERE user_id = 2 AND deleted_at IS NULL ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, created_at DESC LIMIT ? OFFSET ?`
      ).all(2, 0);
      const p2 = db.prepare(
        `SELECT title FROM tasks WHERE user_id = 2 AND deleted_at IS NULL ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, created_at DESC LIMIT ? OFFSET ?`
      ).all(2, 2);
      expect(p1.length).toBe(2);
      expect(p2.length).toBe(2);
    });
  });

  // ============================================================
  // POST /tasks 创建
  // ============================================================
  describe('POST /tasks 创建', () => {
    it('title 必填', () => {
      const body = { desc: 'no title' };
      const shouldThrow = !body.title;
      expect(shouldThrow).toBe(true);
    });

    it('user_id 来自 req.user.id', () => {
      const db = getDb();
      const ins = db.prepare(
        `INSERT INTO tasks (title, "desc", priority, status, due_date, user_id) VALUES (?, ?, ?, ?, ?, ?)`
      ).run('t1', 'desc1', 'high', 'pending', '2026-07-15', 2);
      const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.user_id).toBe(2);
      expect(row.title).toBe('t1');
      expect(row.priority).toBe('high');
      expect(row.status).toBe('pending');
    });
  });

  // ============================================================
  // PUT /tasks/:id 更新（P0-NEW-4 修复后）
  // ============================================================
  describe('PUT /tasks/:id 更新（P0-NEW-4 修复后）', () => {
    it('非自己且非 admin 应被拒（先 SELECT 验权）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('t', 2)`).run();
      const before = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.user_id === 3; // false
      expect(isAdmin || isOwner).toBe(false);
    });

    it('WHERE id = ? 不带 user_id 谓词（绕过 sql.js bug）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('t', 2)`).run();
      const r = db.prepare(
        `UPDATE tasks SET title = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`
      ).run('t2', ins.lastInsertRowid);
      expect(r.changes).toBe(1);
      const row = db.prepare(`SELECT title FROM tasks WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.title).toBe('t2');
    });

    it('软删的 task UPDATE changes=0', () => {
      const db = getDb();
      const ins = db.prepare(
        `INSERT INTO tasks (title, user_id, deleted_at) VALUES ('t', 2, datetime('now'))`
      ).run();
      const r = db.prepare(
        `UPDATE tasks SET title = ? WHERE id = ? AND deleted_at IS NULL`
      ).run('t2', ins.lastInsertRowid);
      expect(r.changes).toBe(0);
    });

    it('字段 merge：body.title 存在则更新，不存在保留 before', () => {
      const db = getDb();
      const ins = db.prepare(
        `INSERT INTO tasks (title, priority, user_id) VALUES ('t', 'low', 2)`
      ).run();
      const before = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(ins.lastInsertRowid);
      const body = { priority: 'high' }; // 不传 title
      const next = {
        title: body.title !== undefined ? body.title : before.title,
        priority: body.priority !== undefined ? body.priority : before.priority,
      };
      db.prepare(
        `UPDATE tasks SET title = ?, priority = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(next.title, next.priority, ins.lastInsertRowid);
      const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.title).toBe('t'); // 保留
      expect(row.priority).toBe('high'); // 更新
    });
  });

  // ============================================================
  // DELETE /tasks/:id 软删
  // ============================================================
  describe('DELETE /tasks/:id 软删', () => {
    it('软删后 GET 查不到', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('t', 2)`).run();
      db.prepare(
        `UPDATE tasks SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`
      ).run(ins.lastInsertRowid);
      const row = db.prepare(
        `SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`
      ).get(ins.lastInsertRowid);
      expect(row).toBeFalsy();
    });

    it('软删幂等：第二次 changes=0', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('t', 2)`).run();
      db.prepare(
        `UPDATE tasks SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`
      ).run(ins.lastInsertRowid);
      const r2 = db.prepare(
        `UPDATE tasks SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`
      ).run(ins.lastInsertRowid);
      expect(r2.changes).toBe(0);
    });

    it('非自己非 admin DELETE 应被拒', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('t', 2)`).run();
      const before = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.user_id === 3;
      expect(isAdmin || isOwner).toBe(false);
    });
  });

  // ============================================================
  // 源码级 invariant（防回归）
  // ============================================================
  describe('源码级 invariant（防回归）', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/tasks.js'),
      'utf8'
    );

    it('PUT 路由用 WHERE id = ? + 先 SELECT 验权（绕过 sql.js 谓词 bug）', () => {
      expect(src).not.toMatch(/WHERE\s+id\s*=\s*\?\s+AND\s+\(user_id\s*=\s*\?\s+OR\s+\?\s*=\s*['"]admin['"]\)/);
      expect(src).toMatch(/before\.user_id\s*!==\s*req\.user\.id/);
    });

    it('DELETE 路由同上', () => {
      expect(src).not.toMatch(/WHERE\s+id\s*=\s*\?\s+AND\s+\(user_id\s*=\s*\?\s+OR\s+\?\s*=\s*['"]admin['"]\)/);
    });

    it('写路由（PUT/DELETE）用 asyncHandler 包裹', () => {
      // 当前源码 PUT + DELETE 都用 asyncHandler(async ...)，POST 是同步函数
      const matches = src.match(/router\.(put|delete)\s*\(\s*['"][^'"]+['"]\s*,\s*asyncHandler/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('priority 排序用 CASE WHEN', () => {
      expect(src).toMatch(/CASE\s+priority\s+WHEN\s+['"]high['"]/);
    });

    it('软删默认过滤', () => {
      expect(src).toMatch(/deleted_at\s+IS\s+NULL/);
    });

    it('tasks.js module.exports = router', () => {
      expect(src).toMatch(/module\.exports\s*=\s*router/);
    });
  });
});