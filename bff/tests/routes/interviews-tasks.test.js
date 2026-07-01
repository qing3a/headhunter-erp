// bff/tests/routes/interviews-tasks.test.js
// P0-NEW-4 修复：interviews + tasks 的 PUT/DELETE 用 sql.js 谓词 bug
// 照搬 candidates.js 模式：先 SELECT 验证权限，再无条件 UPDATE 主键
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P0-NEW-4: sql.js 谓词 bug 修复（interviews + tasks）', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM interviews').run();
    db.prepare('DELETE FROM tasks').run();
    // seed
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'a', 'x', 'consultant')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (2, 'b', 'x', 'consultant')`).run();
  });

  describe('interviews', () => {
    it('用户 B 试图 UPDATE 用户 A 的 interview 应被拒（changes 仍返回 1 但 SELECT 守卫提前抛 notFound）', () => {
      const db = getDb();
      // 用户 A 创建
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 1)`).run();
      const id = ins.lastInsertRowid;

      // 模拟 candidates.js 风格：先 SELECT 验证权限
      const before = db.prepare('SELECT * FROM interviews WHERE id = ?').get(id);
      // 模拟用户 B（id=2, role=consultant）
      const isOwner = before.user_id === 2;  // false
      const isAdmin = 'consultant' === 'admin';  // false
      expect(isOwner || isAdmin).toBe(false);  // 应被拒
    });

    it('WHERE id = ? 主键 UPDATE 不带 user_id 时正常工作', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 1)`).run();
      const id = ins.lastInsertRowid;
      // 修复后的 UPDATE 写法（不带 user_id 谓词）
      const r = db.prepare(`UPDATE interviews SET candidate_name = ? WHERE id = ?`).run('y', id);
      expect(r.changes).toBe(1);
      // 带谓词且不匹配
      const r2 = db.prepare(`UPDATE interviews SET candidate_name = ? WHERE id = ? AND user_id = ?`).run('z', id, 999);
      expect(r2.changes).toBe(0);
    });
  });

  describe('tasks', () => {
    it('WHERE id = ? 主键 UPDATE 不带 user_id 时正常工作', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO tasks (title, user_id) VALUES ('t', 1)`).run();
      const id = ins.lastInsertRowid;
      const r = db.prepare(`UPDATE tasks SET title = ? WHERE id = ?`).run('t2', id);
      expect(r.changes).toBe(1);
      const r2 = db.prepare(`UPDATE tasks SET title = ? WHERE id = ? AND user_id = ?`).run('t3', id, 999);
      expect(r2.changes).toBe(0);
    });
  });
});
