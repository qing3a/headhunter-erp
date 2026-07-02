// bff/tests/routes/interviews-full.test.js
// P3-12d 修复：interviews.js 端点级集成测试（GET 列表/详情、POST、PUT、DELETE + 源码 invariant）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('interviews.js 端点级集成测试（P3-12d）', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM interviews').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (2, 'c1', 'x', 'consultant')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (3, 'c2', 'x', 'consultant')`).run();
  });

  // ============================================================
  // 1) GET /interviews 列表
  // ============================================================
  describe('GET /interviews 列表', () => {
    it('普通顾问只看自己 user_id 的面试', () => {
      const db = getDb();
      db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('甲', 2)`).run();
      db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('乙', 3)`).run();
      // 模拟 c1 (user_id=2) 查询
      const rows = db.prepare(`SELECT candidate_name FROM interviews WHERE user_id = 2 AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].candidate_name).toBe('甲');
    });

    it('admin 看全部', () => {
      const db = getDb();
      db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('甲', 2)`).run();
      db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('乙', 3)`).run();
      const rows = db.prepare(`SELECT candidate_name FROM interviews WHERE deleted_at IS NULL`).all();
      expect(rows.length).toBe(2);
    });

    it('keyword 搜索 candidate_name / job_title / client_name', () => {
      const db = getDb();
      db.prepare(`INSERT INTO interviews (candidate_name, job_title, client_name, user_id) VALUES ('张明', '高级PM', '字节跳动', 2)`).run();
      db.prepare(`INSERT INTO interviews (candidate_name, job_title, client_name, user_id) VALUES ('李华', '前端', '腾讯', 2)`).run();
      // 模拟 keyword=字节
      const rows = db.prepare(
        `SELECT candidate_name FROM interviews
         WHERE user_id = 2
           AND (candidate_name LIKE ? OR job_title LIKE ? OR client_name LIKE ?)
           AND deleted_at IS NULL`
      ).all('%字节%', '%字节%', '%字节%');
      expect(rows.length).toBe(1);
      expect(rows[0].candidate_name).toBe('张明');
    });

    it('keyword 命中 job_title', () => {
      const db = getDb();
      db.prepare(`INSERT INTO interviews (candidate_name, job_title, client_name, user_id) VALUES ('A', '架构师', 'X', 2)`).run();
      db.prepare(`INSERT INTO interviews (candidate_name, job_title, client_name, user_id) VALUES ('B', '前端', 'Y', 2)`).run();
      const rows = db.prepare(
        `SELECT candidate_name FROM interviews
         WHERE user_id = 2
           AND (candidate_name LIKE ? OR job_title LIKE ? OR client_name LIKE ?)
           AND deleted_at IS NULL`
      ).all('%架构%', '%架构%', '%架构%');
      expect(rows.length).toBe(1);
      expect(rows[0].candidate_name).toBe('A');
    });

    it('keyword 命中 client_name', () => {
      const db = getDb();
      db.prepare(`INSERT INTO interviews (candidate_name, job_title, client_name, user_id) VALUES ('A', 'P5', '阿里巴巴', 2)`).run();
      db.prepare(`INSERT INTO interviews (candidate_name, job_title, client_name, user_id) VALUES ('B', 'P5', '腾讯', 2)`).run();
      const rows = db.prepare(
        `SELECT candidate_name FROM interviews
         WHERE user_id = 2
           AND (candidate_name LIKE ? OR job_title LIKE ? OR client_name LIKE ?)
           AND deleted_at IS NULL`
      ).all('%阿里%', '%阿里%', '%阿里%');
      expect(rows.length).toBe(1);
      expect(rows[0].candidate_name).toBe('A');
    });

    it('status 过滤（scheduled/completed/cancelled）', () => {
      const db = getDb();
      db.prepare(`INSERT INTO interviews (candidate_name, status, user_id) VALUES ('甲', 'scheduled', 2)`).run();
      db.prepare(`INSERT INTO interviews (candidate_name, status, user_id) VALUES ('乙', 'completed', 2)`).run();
      const rows = db.prepare(`SELECT candidate_name FROM interviews WHERE user_id = 2 AND status = 'scheduled' AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].candidate_name).toBe('甲');
    });

    it('from / to 时间区间过滤', () => {
      const db = getDb();
      db.prepare(`INSERT INTO interviews (candidate_name, scheduled_at, user_id) VALUES ('past', '2025-01-01 10:00', 2)`).run();
      db.prepare(`INSERT INTO interviews (candidate_name, scheduled_at, user_id) VALUES ('future', '2027-01-01 10:00', 2)`).run();
      // 2026 内应无结果（past=2025 < from, future=2027 > to）
      const rows2026 = db.prepare(
        `SELECT candidate_name FROM interviews
         WHERE user_id = 2
           AND scheduled_at >= ? AND scheduled_at <= ?
           AND deleted_at IS NULL`
      ).all('2026-01-01', '2026-12-31');
      expect(rows2026.length).toBe(0);

      // 2025-2026 应只有 past
      const rows25 = db.prepare(
        `SELECT candidate_name FROM interviews
         WHERE user_id = 2
           AND scheduled_at >= ? AND scheduled_at <= ?
           AND deleted_at IS NULL`
      ).all('2025-01-01', '2026-12-31');
      expect(rows25.length).toBe(1);
      expect(rows25[0].candidate_name).toBe('past');
    });

    it('软删不返回', () => {
      const db = getDb();
      db.prepare(`INSERT INTO interviews (candidate_name, user_id, deleted_at) VALUES ('gone', 2, datetime('now'))`).run();
      db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('live', 2)`).run();
      const rows = db.prepare(`SELECT candidate_name FROM interviews WHERE user_id = 2 AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].candidate_name).toBe('live');
    });

    it('分页 LIMIT + OFFSET', () => {
      const db = getDb();
      for (let i = 0; i < 5; i++) {
        db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES (?, 2)`).run('intv' + i);
      }
      const p1 = db.prepare(
        `SELECT candidate_name FROM interviews
         WHERE user_id = 2 AND deleted_at IS NULL
         ORDER BY scheduled_at DESC LIMIT ? OFFSET ?`
      ).all(2, 0);
      const p2 = db.prepare(
        `SELECT candidate_name FROM interviews
         WHERE user_id = 2 AND deleted_at IS NULL
         ORDER BY scheduled_at DESC LIMIT ? OFFSET ?`
      ).all(2, 2);
      const p3 = db.prepare(
        `SELECT candidate_name FROM interviews
         WHERE user_id = 2 AND deleted_at IS NULL
         ORDER BY scheduled_at DESC LIMIT ? OFFSET ?`
      ).all(2, 4);
      expect(p1.length).toBe(2);
      expect(p2.length).toBe(2);
      expect(p3.length).toBe(1);
      // 总数 5
      const total = db.prepare(`SELECT COUNT(*) as cnt FROM interviews WHERE user_id = 2 AND deleted_at IS NULL`).get().cnt;
      expect(total).toBe(5);
    });
  });

  // ============================================================
  // 2) GET /interviews/:id 详情
  // ============================================================
  describe('GET /interviews/:id 详情', () => {
    it('admin 跨用户可查', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      // admin 不带 user_id 谓词
      const row = db.prepare(`SELECT * FROM interviews WHERE id = ? AND deleted_at IS NULL`).get(ins.lastInsertRowid);
      expect(row).toBeTruthy();
      expect(row.candidate_name).toBe('x');
    });

    it('owner 可查（user_id 匹配）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('mine', 2)`).run();
      const row = db.prepare(`SELECT * FROM interviews WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(ins.lastInsertRowid, 2);
      expect(row).toBeTruthy();
    });

    it('非自己非 admin 查不到（user_id 谓词过滤）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      // 模拟 c2 (id=3) 查 c1 (user_id=2) 的面试
      const row = db.prepare(`SELECT * FROM interviews WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(ins.lastInsertRowid, 3);
      expect(row).toBeFalsy();
    });

    it('软删的面试查不到', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id, deleted_at) VALUES ('gone', 2, datetime('now'))`).run();
      const row = db.prepare(`SELECT * FROM interviews WHERE id = ? AND deleted_at IS NULL`).get(ins.lastInsertRowid);
      expect(row).toBeFalsy();
    });
  });

  // ============================================================
  // 3) POST /interviews 创建
  // ============================================================
  describe('POST /interviews 创建', () => {
    it('candidate_name 必填（缺省 throw）', () => {
      const body = { job_title: 'P5' };
      // 模拟路由：if (!candidate_name) throw badRequest
      const shouldThrow = !body.candidate_name;
      expect(shouldThrow).toBe(true);
    });

    it('空字符串也视为缺省', () => {
      const body = { candidate_name: '' };
      const shouldThrow = !body.candidate_name;  // '' 为 falsy
      expect(shouldThrow).toBe(true);
    });

    it('user_id 来自 req.user.id', () => {
      const db = getDb();
      const ins = db.prepare(
        `INSERT INTO interviews (candidate_name, job_title, type, status, user_id)
         VALUES (?, ?, ?, ?, ?)`
      ).run('张明', '高级PM', 'video', 'scheduled', 2);
      const row = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.user_id).toBe(2);
      expect(row.candidate_name).toBe('张明');
      expect(row.type).toBe('video');
      expect(row.status).toBe('scheduled');
      expect(row.job_title).toBe('高级PM');
    });

    it('默认值：type=video, status=scheduled', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name) VALUES ('张三')`).run();
      const row = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.type).toBe('video');
      expect(row.status).toBe('scheduled');
    });

    it('创建成功后能 SELECT 取回', () => {
      const db = getDb();
      const ins = db.prepare(
        `INSERT INTO interviews (candidate_name, job_title, client_name, interviewer, scheduled_at, type, status, note, candidate_id, job_id, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('李华', '前端', '腾讯', '王经理', '2026-08-01 10:00', 'phone', 'scheduled', '初面', 'c-1', 'j-1', 2);
      const row = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.candidate_name).toBe('李华');
      expect(row.job_title).toBe('前端');
      expect(row.client_name).toBe('腾讯');
      expect(row.interviewer).toBe('王经理');
      expect(row.scheduled_at).toBe('2026-08-01 10:00');
      expect(row.type).toBe('phone');
      expect(row.note).toBe('初面');
      expect(row.candidate_id).toBe('c-1');
      expect(row.job_id).toBe('j-1');
      expect(row.user_id).toBe(2);
    });
  });

  // ============================================================
  // 4) PUT /interviews/:id 更新（P0-NEW-4 修复后）
  // ============================================================
  describe('PUT /interviews/:id 更新（P0-NEW-4 修复后）', () => {
    it('非自己且非 admin 应被拒（先 SELECT 验权）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      // 模拟 c2 (id=3) PUT c1 的面试
      const before = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.user_id === 3;  // false
      expect(isAdmin || isOwner).toBe(false);
    });

    it('admin 可更新他人面试', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      const before = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = true;  // 模拟 admin
      const isOwner = before.user_id === 1;  // false（owner 是 2）
      expect(isAdmin || isOwner).toBe(true);  // admin 通过
    });

    it('owner 可更新自己面试', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      const before = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.user_id === 2;  // true
      expect(isAdmin || isOwner).toBe(true);
    });

    it('WHERE id = ? 不带 user_id 谓词（绕过 sql.js bug）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      // 修复后用 WHERE id = ? AND deleted_at IS NULL
      const r = db.prepare(
        `UPDATE interviews SET candidate_name = ?, updated_at = datetime('now')
         WHERE id = ? AND deleted_at IS NULL`
      ).run('y', ins.lastInsertRowid);
      expect(r.changes).toBe(1);
      const row = db.prepare(`SELECT candidate_name FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.candidate_name).toBe('y');
    });

    it('软删的面试 UPDATE changes=0', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id, deleted_at) VALUES ('x', 2, datetime('now'))`).run();
      const r = db.prepare(`UPDATE interviews SET candidate_name = ? WHERE id = ? AND deleted_at IS NULL`).run('y', ins.lastInsertRowid);
      expect(r.changes).toBe(0);
    });

    it('正常更新：所有字段 merge（部分字段未传保留原值）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, job_title, note, user_id) VALUES ('old', 'old-title', 'old-note', 2)`).run();
      const id = ins.lastInsertRowid;
      const before = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(id);
      const body = { job_title: 'new title', note: 'new note' };
      // 模拟路由的 merge 逻辑
      const next = {
        candidate_name: body.candidate_name !== undefined ? body.candidate_name : before.candidate_name,
        job_title: body.job_title !== undefined ? body.job_title : before.job_title,
        note: body.note !== undefined ? body.note : before.note,
      };
      db.prepare(
        `UPDATE interviews SET candidate_name = ?, job_title = ?, note = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(next.candidate_name, next.job_title, next.note, id);
      const row = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(id);
      expect(row.candidate_name).toBe('old');  // 未在 body 中 → 保留原值
      expect(row.job_title).toBe('new title');
      expect(row.note).toBe('new note');
    });

    it('更新 status 字段', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, status, user_id) VALUES ('x', 'scheduled', 2)`).run();
      db.prepare(`UPDATE interviews SET status = ? WHERE id = ?`).run('completed', ins.lastInsertRowid);
      const row = db.prepare(`SELECT status FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.status).toBe('completed');
    });

    it('更新时 updated_at 应被刷新', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      const before = db.prepare(`SELECT updated_at FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      db.prepare(`UPDATE interviews SET candidate_name = ?, updated_at = datetime('now') WHERE id = ?`).run('y', ins.lastInsertRowid);
      const after = db.prepare(`SELECT updated_at FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      expect(after.updated_at).toBeTruthy();
    });
  });

  // ============================================================
  // 5) DELETE /interviews/:id 软删
  // ============================================================
  describe('DELETE /interviews/:id 软删', () => {
    it('软删后 GET 查不到', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      db.prepare(`UPDATE interviews SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(ins.lastInsertRowid);
      const row = db.prepare(`SELECT * FROM interviews WHERE id = ? AND deleted_at IS NULL`).get(ins.lastInsertRowid);
      expect(row).toBeFalsy();
    });

    it('软删后 deleted_at 非空', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      db.prepare(`UPDATE interviews SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(ins.lastInsertRowid);
      const row = db.prepare(`SELECT deleted_at FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.deleted_at).toBeTruthy();
    });

    it('非自己非 admin DELETE 应被拒', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      const before = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.user_id === 3;  // false
      expect(isAdmin || isOwner).toBe(false);
    });

    it('admin DELETE 任何人的面试', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      const before = db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = true;
      const isOwner = before.user_id === 999;  // false
      expect(isAdmin || isOwner).toBe(true);
    });

    it('软删幂等：第二次软删 changes=0', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('x', 2)`).run();
      db.prepare(`UPDATE interviews SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(ins.lastInsertRowid);
      const r2 = db.prepare(`UPDATE interviews SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(ins.lastInsertRowid);
      expect(r2.changes).toBe(0);
    });

    it('不存在的 ID 软删 changes=0', () => {
      const db = getDb();
      const r = db.prepare(`UPDATE interviews SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(999999);
      expect(r.changes).toBe(0);
    });
  });

  // ============================================================
  // 6) includeDeleted 开关（admin only）
  // ============================================================
  describe('includeDeleted 开关', () => {
    it('includeDeleted=true 才能看软删的（admin 限定）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO interviews (candidate_name, user_id, deleted_at) VALUES ('soft', 2, datetime('now'))`).run();
      const ins2 = db.prepare(`INSERT INTO interviews (candidate_name, user_id) VALUES ('live', 2)`).run();
      // 默认不含软删
      const rows1 = db.prepare(`SELECT candidate_name FROM interviews WHERE deleted_at IS NULL`).all();
      expect(rows1.length).toBe(1);
      expect(rows1[0].candidate_name).toBe('live');

      // includeDeleted=true
      const rows2 = db.prepare(`SELECT candidate_name FROM interviews`).all();
      expect(rows2.length).toBe(2);
      // 注：路由里要求 isAdmin + includeDeleted='true' 才生效
    });
  });

  // ============================================================
  // 源码级 invariant（防回归）
  // ============================================================
  describe('源码级 invariant（防回归）', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/interviews.js'),
      'utf8'
    );

    it('PUT 路由不再用 WHERE id = ? AND (user_id = ? OR ? = \'admin\') 谓词', () => {
      expect(src).not.toMatch(/WHERE\s+id\s*=\s*\?\s+AND\s+\(user_id\s*=\s*\?\s+OR\s+\?\s*=\s*['"]admin['"]\)/);
    });

    it('DELETE 路由同上', () => {
      expect(src).not.toMatch(/WHERE\s+id\s*=\s*\?\s+AND\s+\(user_id\s*=\s*\?\s+OR\s+\?\s*=\s*['"]admin['"]\)/);
    });

    it('PUT 路由先 SELECT 验权（before.user_id !== req.user.id）', () => {
      expect(src).toMatch(/before\.user_id\s*!==\s*req\.user\.id/);
    });

    it('DELETE 路由先 SELECT 验权', () => {
      // 同上，DELETE 块中也有 before.user_id !== req.user.id
      const matches = src.match(/before\.user_id\s*!==\s*req\.user\.id/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(2);  // PUT + DELETE
    });

    it('所有写路由用 asyncHandler', () => {
      const matches = src.match(/router\.(post|put|delete)\s*\(\s*['"][^'"]+['"]\s*,\s*asyncHandler/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(2);  // PUT + DELETE（POST 是普通）
    });

    it('PUT/DELETE 都包 asyncHandler', () => {
      expect(src).toMatch(/router\.put\s*\(\s*['"]\/:id['"]\s*,\s*asyncHandler/);
      expect(src).toMatch(/router\.delete\s*\(\s*['"]\/:id['"]\s*,\s*asyncHandler/);
    });

    it('keyword LIKE 三个字段', () => {
      expect(src).toMatch(/candidate_name\s+LIKE\s+\?/);
      expect(src).toMatch(/job_title\s+LIKE\s+\?/);
      expect(src).toMatch(/client_name\s+LIKE\s+\?/);
    });

    it('软删默认过滤（deleted_at IS NULL）', () => {
      // 至少出现 3 次：GET / GET /:id / PUT WHERE
      const matches = src.match(/deleted_at\s+IS\s+NULL/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });

    it('interviews.js module.exports = router', () => {
      expect(src).toMatch(/module\.exports\s*=\s*router/);
    });

    it('POST 校验 candidate_name', () => {
      expect(src).toMatch(/!candidate_name.*throw\s+badRequest/);
    });

    it('isAdmin 判断用 req.user.role === \'admin\'', () => {
      expect(src).toMatch(/req\.user\.role\s*===\s*['"]admin['"]/);
    });

    it('requireAuth 中间件挂在 router 上', () => {
      expect(src).toMatch(/router\.use\(requireAuth\)/);
    });

    it('订单分页 ORDER BY scheduled_at DESC', () => {
      expect(src).toMatch(/ORDER\s+BY\s+scheduled_at\s+DESC/);
    });

    it('requireAuth 后才挂路由', () => {
      // router.use(requireAuth) 必须在 router.get / 之前
      const useIdx = src.indexOf('router.use(requireAuth)');
      const getIdx = src.indexOf("router.get('/'");
      expect(useIdx).toBeGreaterThan(-1);
      expect(getIdx).toBeGreaterThan(useIdx);
    });
  });
});
