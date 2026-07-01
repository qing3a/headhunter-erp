// tests/routes/recommendations-scan.test.js
// P0-NEW-3 修复：scanOverdueRecommendations mutex（防启动 scan 与手动 scan 并发）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('scanOverdueRecommendations mutex (P0-NEW-3)', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM recommendation_status_history').run();
    db.prepare('DELETE FROM recommendations').run();
    db.prepare('DELETE FROM tasks').run();
    // seed FK
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'tester', 'x', 'consultant')`).run();
    db.prepare(`INSERT OR IGNORE INTO candidates (id, name, user_id) VALUES (1, 'test_cand', 1)`).run();
  });

  it('并发两次 scan 只产生 1 条 history（被 mutex 串行化）', async () => {
    const db = getDb();
    // 准备 1 条 overdue 推荐
    const ins = db.prepare(`
      INSERT INTO recommendations
        (candidate_id, status, recommend_at, last_status_change_at, recommend_user_id, job_title)
      VALUES (1, 'recommended', datetime('now', '-4 days'), datetime('now', '-4 days'), 1, '测试职位')
    `).run();
    const recId = ins.lastInsertRowid;

    const recRouter = await import('../../src/routes/recommendations.js');

    // 触发两次并发 scan
    await Promise.all([
      recRouter.scanOverdueRecommendations(),
      recRouter.scanOverdueRecommendations()
    ]);

    // history 应该只有 1 条（mutex 串行化，第二次 SELECT 时 status 已变成 pending_feedback）
    const history = db.prepare(
      'SELECT * FROM recommendation_status_history WHERE recommendation_id = ?'
    ).all(recId);
    expect(history.length).toBe(1);

    // task 也应该只有 1 个
    const tasks = db.prepare(`SELECT * FROM tasks WHERE "desc" LIKE ?`).all('%推荐已 3 天无客户反馈%');
    expect(tasks.length).toBe(1);
  });

  it('第二次 scan 串行跟在第一次后，跑完返回 processed=0（已无 overdue）', async () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO recommendations
        (candidate_id, status, recommend_at, last_status_change_at, recommend_user_id, job_title)
      VALUES (1, 'recommended', datetime('now', '-4 days'), datetime('now', '-4 days'), 1, '测试')
    `).run();

    const recRouter = await import('../../src/routes/recommendations.js');
    const r1 = await recRouter.scanOverdueRecommendations();
    const r2 = await recRouter.scanOverdueRecommendations();

    expect(r1.processed).toBe(1);
    expect(r2.processed).toBe(0);
  });
});
