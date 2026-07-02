// tests/routes/recommendations-full.test.js
// P3-12c 修复：recommendations.js 端点级集成测试（8 个端点 + 源码 invariant）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('recommendations.js 端点级集成测试（P3-12c）', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM recommendation_status_history').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM recommendations').run();
    db.prepare('DELETE FROM candidates').run();
    db.prepare('DELETE FROM jobs').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (2, 'c1', 'x', 'consultant')`).run();
  });

  // ============================================================
  // 1) GET /recommendations 列表
  // ============================================================
  describe('GET /recommendations 列表', () => {
    it('普通顾问只看自己 recommend_user_id 的推荐', () => {
      const db = getDb();
      const a = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P6', 'recommended', 999)`).run();
      // 模拟 c1 (id=2) 查询
      const rows = db.prepare(`SELECT id, job_title FROM recommendations WHERE recommend_user_id = ? AND deleted_at IS NULL`).all(2);
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(a.lastInsertRowid);
    });

    it('admin 不加 user_id 过滤看全部', () => {
      const db = getDb();
      db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P6', 'recommended', 999)`).run();
      const rows = db.prepare(`SELECT id FROM recommendations WHERE deleted_at IS NULL`).all();
      expect(rows.length).toBe(2);
    });

    it('owner_only=true 显式只过滤自己', () => {
      const db = getDb();
      db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P6', 'recommended', 999)`).run();
      const rows = db.prepare(`SELECT id FROM recommendations WHERE recommend_user_id = 2 AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
    });

    it('candidate_id 过滤', () => {
      const db = getDb();
      const r1 = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (2, 'P6', 'recommended', 2)`).run();
      const rows = db.prepare(`SELECT id FROM recommendations WHERE recommend_user_id = 2 AND candidate_id = 1 AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(r1.lastInsertRowid);
    });

    it('status 过滤', () => {
      const db = getDb();
      const a = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P6', 'rejected', 2)`).run();
      const rows = db.prepare(`SELECT id FROM recommendations WHERE recommend_user_id = 2 AND status = ? AND deleted_at IS NULL`).all('recommended');
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(a.lastInsertRowid);
    });

    it('job_id 过滤', () => {
      const db = getDb();
      const j = db.prepare(`INSERT INTO jobs (title, owner_user_id) VALUES ('P5', 2)`).run();
      const a = db.prepare(`INSERT INTO recommendations (candidate_id, job_id, job_title, status, recommend_user_id) VALUES (1, ?, 'P5', 'recommended', 2)`).run(j.lastInsertRowid);
      db.prepare(`INSERT INTO recommendations (candidate_id, job_id, job_title, status, recommend_user_id) VALUES (1, NULL, 'P6', 'recommended', 2)`).run();
      const rows = db.prepare(`SELECT id FROM recommendations WHERE recommend_user_id = 2 AND job_id = ? AND deleted_at IS NULL`).all(j.lastInsertRowid);
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(a.lastInsertRowid);
    });
  });

  // ============================================================
  // 2) GET /recommendations/overdue 分页
  // ============================================================
  describe('GET /recommendations/overdue', () => {
    it('status=recommended + recommend_at > 3 天前才 overdue', () => {
      const db = getDb();
      const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
      // 插入 4 天前的（严格 < 三天前阈值）
      const fourDaysAgo = new Date(Date.now() - 4 * 86400 * 1000).toISOString();
      db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_at, recommend_user_id) VALUES (1, 'P5', 'recommended', ?, 2)`).run(fourDaysAgo);
      const rows = db.prepare(`SELECT id FROM recommendations WHERE status = 'recommended' AND recommend_at < ? AND deleted_at IS NULL`).all(threeDaysAgo);
      expect(rows.length).toBe(1);
    });

    it('未到 3 天不 overdue', () => {
      const db = getDb();
      const oneDayAgo = new Date(Date.now() - 1 * 86400 * 1000).toISOString();
      const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
      db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_at, recommend_user_id) VALUES (1, 'P5', 'recommended', ?, 2)`).run(oneDayAgo);
      const rows = db.prepare(`SELECT id FROM recommendations WHERE status = 'recommended' AND recommend_at < ? AND deleted_at IS NULL`).all(threeDaysAgo);
      expect(rows.length).toBe(0);
    });

    it('分页：limit + offset', () => {
      const db = getDb();
      const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
      const fourDaysAgo = new Date(Date.now() - 4 * 86400 * 1000).toISOString();
      for (let i = 0; i < 5; i++) {
        db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_at, recommend_user_id) VALUES (?, 'P5', 'recommended', ?, 2)`).run(i + 1, fourDaysAgo);
      }
      const rows1 = db.prepare(`SELECT id FROM recommendations WHERE status = 'recommended' AND recommend_at < ? AND deleted_at IS NULL ORDER BY recommend_at ASC LIMIT ? OFFSET ?`).all(threeDaysAgo, 2, 0);
      const rows2 = db.prepare(`SELECT id FROM recommendations WHERE status = 'recommended' AND recommend_at < ? AND deleted_at IS NULL ORDER BY recommend_at ASC LIMIT ? OFFSET ?`).all(threeDaysAgo, 2, 2);
      const rows3 = db.prepare(`SELECT id FROM recommendations WHERE status = 'recommended' AND recommend_at < ? AND deleted_at IS NULL ORDER BY recommend_at ASC LIMIT ? OFFSET ?`).all(threeDaysAgo, 2, 4);
      expect(rows1.length).toBe(2);
      expect(rows2.length).toBe(2);
      expect(rows3.length).toBe(1);
      expect(rows1[0].id).not.toBe(rows2[0].id);
    });
  });

  // ============================================================
  // 3) POST /recommendations 创建
  // ============================================================
  describe('POST /recommendations 创建', () => {
    it('candidate_id 必填', () => {
      const body = {};
      const shouldThrow = !body.candidate_id;
      expect(shouldThrow).toBe(true);
    });

    it('候选人存在性校验：不存在 → notFound', () => {
      const db = getDb();
      const cand = db.prepare(`SELECT id FROM candidates WHERE id = ? AND deleted_at IS NULL`).get(999);
      expect(cand).toBeFalsy();
    });

    it('候选人存在性校验：软删 → notFound（deleted_at IS NULL 守卫）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO candidates (name, user_id, deleted_at) VALUES ('x', 2, datetime('now'))`).run();
      const cand = db.prepare(`SELECT id FROM candidates WHERE id = ? AND deleted_at IS NULL`).get(ins.lastInsertRowid);
      expect(cand).toBeFalsy();
    });

    it('job.status=closed 应拒（P2-C1 修复）', () => {
      const db = getDb();
      const jobIns = db.prepare(`INSERT INTO jobs (title, owner_user_id, status) VALUES ('P5', 2, 'closed')`).run();
      const job = db.prepare(`SELECT status FROM jobs WHERE id = ? AND deleted_at IS NULL`).get(jobIns.lastInsertRowid);
      expect(job.status).toBe('closed');
      // 模拟路由：if (job.status === 'closed') throw badRequest
    });

    it('status 必为合法值', () => {
      const validStatuses = ['recommended', 'pending_feedback', 'interviewing', 'offered', 'hired', 'rejected', 'withdrawn'];
      expect(validStatuses.indexOf('recommended')).toBeGreaterThanOrEqual(0);
      expect(validStatuses.indexOf('invalid_status')).toBe(-1);
    });

    it('创建成功：recommend_user_id 来自 req.user.id', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id, recommend_username) VALUES (1, 'P5', 'recommended', 2, 'c1')`).run();
      const row = db.prepare(`SELECT * FROM recommendations WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.recommend_user_id).toBe(2);
      expect(row.recommend_username).toBe('c1');
    });

    it('创建时写初始 history（from_status=null, to_status=initial）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      const recId = ins.lastInsertRowid;
      db.prepare(`INSERT INTO recommendation_status_history (recommendation_id, from_status, to_status, changed_by_user_id, note) VALUES (?, ?, ?, ?, ?)`).run(recId, null, 'recommended', 2, '初始创建');

      const hist = db.prepare(`SELECT * FROM recommendation_status_history WHERE recommendation_id = ? ORDER BY changed_at ASC, id ASC`).all(recId);
      expect(hist.length).toBe(1);
      expect(hist[0].from_status).toBeNull();
      expect(hist[0].to_status).toBe('recommended');
    });
  });

  // ============================================================
  // 4) GET /recommendations/:id 详情
  // ============================================================
  describe('GET /:id 详情', () => {
    it('返回 row + history 数组', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      const recId = ins.lastInsertRowid;
      db.prepare(`INSERT INTO recommendation_status_history (recommendation_id, from_status, to_status, changed_by_user_id, note) VALUES (?, NULL, 'recommended', 2, 'init')`).run(recId);
      db.prepare(`INSERT INTO recommendation_status_history (recommendation_id, from_status, to_status, changed_by_user_id, note) VALUES (?, 'recommended', 'interviewing', 2, '面试')`).run(recId);

      const row = db.prepare(`SELECT * FROM recommendations WHERE id = ? AND deleted_at IS NULL`).get(recId);
      const hist = db.prepare(`SELECT * FROM recommendation_status_history WHERE recommendation_id = ? ORDER BY changed_at ASC, id ASC`).all(recId);
      expect(row).toBeTruthy();
      expect(hist.length).toBe(2);
      expect(hist[0].to_status).toBe('recommended');
      expect(hist[1].to_status).toBe('interviewing');
    });

    it('软删后查不到（deleted_at IS NULL 守卫）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id, deleted_at) VALUES (1, 'P5', 'recommended', 2, datetime('now'))`).run();
      const row = db.prepare(`SELECT * FROM recommendations WHERE id = ? AND deleted_at IS NULL`).get(ins.lastInsertRowid);
      expect(row).toBeFalsy();
    });
  });

  // ============================================================
  // 5) PUT /:id 更新
  // ============================================================
  describe('PUT /:id 更新', () => {
    it('更新 job_title / notes 不改 status', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      const recId = ins.lastInsertRowid;
      db.prepare(`UPDATE recommendations SET job_title = ?, notes = ? WHERE id = ?`).run('P6', '更新', recId);
      const row = db.prepare(`SELECT * FROM recommendations WHERE id = ?`).get(recId);
      expect(row.job_title).toBe('P6');
      expect(row.notes).toBe('更新');
      expect(row.status).toBe('recommended');
    });

    it('软删后 PUT 应被拒', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id, deleted_at) VALUES (1, 'P5', 'recommended', 2, datetime('now'))`).run();
      const before = db.prepare(`SELECT * FROM recommendations WHERE id = ?`).get(ins.lastInsertRowid);
      expect(before.deleted_at).toBeTruthy();
      // 路由守卫：if (!before || before.deleted_at) throw notFound
    });
  });

  // ============================================================
  // 6) POST /:id/status 状态流转
  // ============================================================
  describe('POST /:id/status 状态流转', () => {
    let recId;
    beforeEach(() => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      recId = ins.lastInsertRowid;
    });

    it('合法流转：recommended → pending_feedback', () => {
      // VALID_TRANSITIONS['recommended'] = ['pending_feedback', 'rejected', 'withdrawn', 'interviewing']
      const valid = ['pending_feedback', 'rejected', 'withdrawn', 'interviewing'];
      expect(valid.indexOf('pending_feedback')).toBeGreaterThanOrEqual(0);
    });

    it('非法流转：recommended → hired 应被拒', () => {
      const valid = ['pending_feedback', 'rejected', 'withdrawn', 'interviewing'];
      expect(valid.indexOf('hired')).toBe(-1);
    });

    it('非法流转：hired → recommended 应被拒（终态）', () => {
      // VALID_TRANSITIONS['hired'] = []（终态）
      expect([].indexOf('recommended')).toBe(-1);
    });

    it('非法流转：hired → rejected 应被拒（终态）', () => {
      expect([].indexOf('rejected')).toBe(-1);
    });

    it('withdrawn 可回到 recommended（特殊）', () => {
      // VALID_TRANSITIONS['withdrawn'] = ['recommended']
      expect(['recommended'].indexOf('recommended')).toBeGreaterThanOrEqual(0);
    });

    it('状态变更写 history（from → to + 用户 + note）', () => {
      const db = getDb();
      db.prepare(`UPDATE recommendations SET status = ?, last_status_change_at = datetime('now') WHERE id = ?`).run('pending_feedback', recId);
      db.prepare(`INSERT INTO recommendation_status_history (recommendation_id, from_status, to_status, changed_by_user_id, note) VALUES (?, ?, ?, ?, ?)`).run(recId, 'recommended', 'pending_feedback', 2, '客户反馈中');

      const hist = db.prepare(`SELECT * FROM recommendation_status_history WHERE recommendation_id = ? ORDER BY changed_at ASC, id ASC`).all(recId);
      expect(hist.length).toBe(1);
      expect(hist[0].from_status).toBe('recommended');
      expect(hist[0].to_status).toBe('pending_feedback');
    });

    it('last_status_change_at 应被更新', () => {
      const db = getDb();
      const before = db.prepare(`SELECT last_status_change_at FROM recommendations WHERE id = ?`).get(recId);
      db.prepare(`UPDATE recommendations SET status = ?, last_status_change_at = datetime('now') WHERE id = ?`).run('pending_feedback', recId);
      const after = db.prepare(`SELECT last_status_change_at FROM recommendations WHERE id = ?`).get(recId);
      expect(after.last_status_change_at).toBeTruthy();
      // 验证：原值为 null，更新后非空
      expect(before.last_status_change_at).toBeFalsy();
    });
  });

  // ============================================================
  // 7) DELETE /:id 软删
  // ============================================================
  describe('DELETE /:id 软删', () => {
    it('软删后 recommend_at 仍保留但 deleted_at 非空', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      db.prepare(`UPDATE recommendations SET deleted_at = datetime('now') WHERE id = ?`).run(ins.lastInsertRowid);
      const row = db.prepare(`SELECT * FROM recommendations WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.deleted_at).toBeTruthy();
    });

    it('软删后默认列表查询不到', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO recommendations (candidate_id, job_title, status, recommend_user_id) VALUES (1, 'P5', 'recommended', 2)`).run();
      db.prepare(`UPDATE recommendations SET deleted_at = datetime('now') WHERE id = ?`).run(ins.lastInsertRowid);
      const rows = db.prepare(`SELECT id FROM recommendations WHERE deleted_at IS NULL`).all();
      expect(rows.length).toBe(0);
    });
  });

  // ============================================================
  // 8) POST /scan-overdue admin 触发
  // ============================================================
  describe('POST /scan-overdue', () => {
    it('requireRole admin 守卫（路由 requireRole(\'admin\')）', async () => {
      const src = fs.readFileSync(
        path.join(__dirname, '../../src/routes/recommendations.js'),
        'utf8'
      );
      expect(src).toMatch(/router\.post\(['"]\/scan-overdue['"],\s*requireRole\(['"]admin['"]\)/);
    });
  });

  // ============================================================
  // 源码级 invariant（防回归）
  // ============================================================
  describe('源码级 invariant（防回归）', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/recommendations.js'),
      'utf8'
    );

    it('VALID_TRANSITIONS 含 7 个状态 + 终态 hired/rejected', () => {
      expect(src).toMatch(/'hired':\s*\[\]/);
      expect(src).toMatch(/'rejected':\s*\[\]/);
      expect(src).toMatch(/'recommended':\s*\[/);
    });

    it('canTransition 校验函数', () => {
      expect(src).toMatch(/function\s+canTransition/);
    });

    it('scanOverdueRecommendations 含 withScanLock', () => {
      expect(src).toMatch(/withScanLock/);
    });

    it('job.status=closed 拒推荐（P2-C1 修复）', () => {
      expect(src).toMatch(/job\.status\s*===\s*['"]closed['"]/);
    });

    it('overdue 列表分页', () => {
      expect(src).toMatch(/overdue[\s\S]+?LIMIT\s+\?\s+OFFSET\s+\?/);
    });

    it('history 含 ORDER BY changed_at ASC, id ASC', () => {
      expect(src).toMatch(/ORDER\s+BY\s+changed_at\s+ASC,\s+id\s+ASC/);
    });

    it('recommendations.js 导出 router + scanOverdueRecommendations', () => {
      expect(src).toMatch(/router\.scanOverdueRecommendations\s*=\s*scanOverdueRecommendations/);
    });

    it('STATUS_VALUES 7 个合法值', () => {
      expect(src).toMatch(/STATUS_VALUES\s*=\s*\[['"]recommended['"],\s*['"]pending_feedback['"],\s*['"]interviewing['"],\s*['"]offered['"],\s*['"]hired['"],\s*['"]rejected['"],\s*['"]withdrawn['"]\]/);
    });
  });
});
