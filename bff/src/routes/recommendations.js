const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');
const { success, pagination } = require('../utils/response');
const { badRequest, notFound } = require('../utils/errors');
const auditService = require('../services/auditService');
const asyncHandler = require('../utils/asyncHandler');
const { getDb } = require('../db/init');

const router = express.Router();
router.use(requireAuth);

const STATUS_VALUES = ['recommended', 'pending_feedback', 'interviewing', 'offered', 'hired', 'rejected', 'withdrawn'];

const VALID_TRANSITIONS = {
  'recommended': ['pending_feedback', 'rejected', 'withdrawn', 'interviewing'],
  'pending_feedback': ['interviewing', 'rejected', 'withdrawn', 'recommended'],
  'interviewing': ['offered', 'rejected', 'withdrawn'],
  'offered': ['hired', 'rejected', 'withdrawn'],
  'hired': [],
  'rejected': [],
  'withdrawn': ['recommended']
};

function canTransition(from, to) {
  if (from === to) return false;
  if (!VALID_TRANSITIONS[from]) return false;
  return VALID_TRANSITIONS[from].indexOf(to) !== -1;
}

function getValidNextStatuses(from) {
  return VALID_TRANSITIONS[from] || [];
}

/**
 * GET /api/v1/recommendations
 * 列表
 */
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const { candidate_id, status, job_id, owner_only } = req.query;
  const isAdmin = req.user.role === 'admin';
  const includeDeleted = req.query.includeDeleted === 'true' && isAdmin;
  const db = getDb();

  const where = [];
  const params = [];
  if (!includeDeleted) where.push('r.deleted_at IS NULL');
  if (owner_only === 'true' || !isAdmin) {
    where.push('r.recommend_user_id = ?');
    params.push(req.user.id);
  }
  if (candidate_id) { where.push('r.candidate_id = ?'); params.push(parseInt(candidate_id)); }
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (job_id) { where.push('r.job_id = ?'); params.push(parseInt(job_id)); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM recommendations r ${whereSql}`).get(...params).cnt;
  const rows = db.prepare(
    `SELECT r.*, c.name AS candidate_name, j.title AS job_title_ref
     FROM recommendations r
     LEFT JOIN candidates c ON c.id = r.candidate_id
     LEFT JOIN jobs j ON j.id = r.job_id
     ${whereSql}
     ORDER BY r.recommend_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset);
  res.json(pagination(rows, total, page, pageSize));
}));

/**
 * GET /api/v1/recommendations/overdue
 * 推荐 3 天后状态仍 recommended 的记录
 */
router.get('/overdue', asyncHandler(async (req, res) => {
  const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
  const isAdmin = req.user.role === 'admin';
  // ===== P3-15 修复：overdue 列表分页 =====
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const db = getDb();
  let where = `r.status = 'recommended' AND r.recommend_at < ? AND r.deleted_at IS NULL`;
  const params = [threeDaysAgo];
  if (!isAdmin) {
    where += ' AND r.recommend_user_id = ?';
    params.push(req.user.id);
  }
  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM recommendations r WHERE ${where}`).get(...params).cnt;
  const rows = db.prepare(
    `SELECT r.*, c.name AS candidate_name FROM recommendations r
     LEFT JOIN candidates c ON c.id = r.candidate_id
     WHERE ${where}
     ORDER BY r.recommend_at ASC
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset);
  res.json(success(rows, { total: total, page: page, pageSize: pageSize }));
}));

/**
 * POST /api/v1/recommendations/scan-overdue
 * 手动触发扫描（admin only）
 * 规则：status=recommended AND recommend_at < 3 天前 → 改 pending_feedback + 写 history + 创建 task
 */
router.post('/scan-overdue', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = scanOverdueRecommendations();
  res.json(success({ processed: result.processed, tasks_created: result.tasks_created }));
}));

/**
 * GET /api/v1/recommendations/:id
 * 详情（含 history）
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const recId = parseInt(req.params.id);
  if (!recId) throw badRequest('无效的推荐 ID');
  const db = getDb();
  const row = db.prepare(
    `SELECT r.*, c.name AS candidate_name, j.title AS job_title_ref
     FROM recommendations r
     LEFT JOIN candidates c ON c.id = r.candidate_id
     LEFT JOIN jobs j ON j.id = r.job_id
     WHERE r.id = ? AND r.deleted_at IS NULL`
  ).get(recId);
  if (!row) throw notFound('推荐记录不存在');
  if (req.user.role !== 'admin' && row.recommend_user_id !== req.user.id) {
    throw notFound('推荐记录不存在');
  }
  const history = db.prepare(
    `SELECT * FROM recommendation_status_history WHERE recommendation_id = ? ORDER BY changed_at ASC, id ASC`
  ).all(recId);
  res.json(success({ ...row, history }));
}));

/**
 * POST /api/v1/recommendations
 * 创建
 */
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.candidate_id) throw badRequest('候选人 ID 必填');
  const db = getDb();
  // 验证候选人存在
  const cand = db.prepare(
    req.user.role === 'admin'
      ? 'SELECT id FROM candidates WHERE id = ? AND deleted_at IS NULL'
      : 'SELECT id FROM candidates WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
  ).get(...(req.user.role === 'admin' ? [body.candidate_id] : [body.candidate_id, req.user.id]));
  if (!cand) throw notFound('候选人不存在');

  // 验证 job（如有）
  let jobTitle = body.job_title || null;
  let jobCompany = body.job_company || null;
  if (body.job_id) {
    // ===== P2-C1 修复：查 title/company/status，closed 职位不能推荐 =====
    const job = db.prepare('SELECT title, company, status FROM jobs WHERE id = ? AND deleted_at IS NULL').get(body.job_id);
    if (!job) throw notFound('关联的职位不存在');
    if (job.status === 'closed') throw badRequest('该职位已关闭，不能推荐');
    jobTitle = jobTitle || job.title;
    jobCompany = jobCompany || job.company;
  }

  const status = body.status || 'recommended';
  if (STATUS_VALUES.indexOf(status) === -1) throw badRequest('状态值非法');

  db.prepare(`
    INSERT INTO recommendations
      (candidate_id, job_id, job_title, job_company, client_name,
       status, recommend_method, expected_salary, notes,
       recommend_user_id, recommend_username)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(body.candidate_id),
    body.job_id ? parseInt(body.job_id) : null,
    jobTitle, jobCompany,
    body.client_name || null,
    status,
    body.recommend_method || null,
    body.expected_salary || null,
    body.notes || null,
    req.user.id,
    req.user.displayName || req.user.username
  );

  // sql.js 中 SELECT last_insert_rowid() 返回 0，改用 ORDER BY id DESC
  const row = db.prepare('SELECT * FROM recommendations ORDER BY id DESC LIMIT 1').get();
  const recId = row.id;
  // 写初始 history
  db.prepare(`
    INSERT INTO recommendation_status_history (recommendation_id, from_status, to_status, changed_by_user_id, changed_by_username, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recId, null, status, req.user.id, req.user.displayName || req.user.username, body.notes || '初始创建');

  auditService.log(req.user.id, 'CREATE_recommendation', 'recommendation', recId, body, req.ip);
  res.json(success(row));
}));

/**
 * PUT /api/v1/recommendations/:id
 * 更新（基本信息，不含 status）
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const recId = parseInt(req.params.id);
  if (!recId) throw badRequest('无效的推荐 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(recId);
  if (!before || before.deleted_at) throw notFound('推荐记录不存在');
  if (req.user.role !== 'admin' && before.recommend_user_id !== req.user.id) {
    throw notFound('推荐记录不存在或无权操作');
  }
  const body = req.body || {};
  const next = {
    job_id: body.job_id !== undefined ? (body.job_id ? parseInt(body.job_id) : null) : before.job_id,
    job_title: body.job_title !== undefined ? body.job_title : before.job_title,
    job_company: body.job_company !== undefined ? body.job_company : before.job_company,
    client_name: body.client_name !== undefined ? body.client_name : before.client_name,
    recommend_method: body.recommend_method !== undefined ? body.recommend_method : before.recommend_method,
    expected_salary: body.expected_salary !== undefined ? body.expected_salary : before.expected_salary,
    notes: body.notes !== undefined ? body.notes : before.notes,
  };
  const result = db.prepare(`
    UPDATE recommendations SET
      job_id = ?, job_title = ?, job_company = ?, client_name = ?,
      recommend_method = ?, expected_salary = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(next.job_id, next.job_title, next.job_company, next.client_name, next.recommend_method, next.expected_salary, next.notes, recId);
  if (result.changes === 0) throw notFound('推荐记录不存在或无权操作');
  const row = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(recId);
  auditService.log(req.user.id, 'UPDATE_recommendation', 'recommendation', recId, { before, after: row }, req.ip);
  res.json(success(row));
}));

/**
 * POST /api/v1/recommendations/:id/status
 * 状态流转（核心）
 */
router.post('/:id/status', asyncHandler(async (req, res) => {
  const recId = parseInt(req.params.id);
  if (!recId) throw badRequest('无效的推荐 ID');
  const { to_status, note } = req.body || {};
  if (!to_status) throw badRequest('目标状态必填');
  if (STATUS_VALUES.indexOf(to_status) === -1) throw badRequest('状态值非法');
  const db = getDb();
  const before = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(recId);
  if (!before || before.deleted_at) throw notFound('推荐记录不存在');
  if (req.user.role !== 'admin' && before.recommend_user_id !== req.user.id) {
    throw notFound('推荐记录不存在或无权操作');
  }
  if (!canTransition(before.status, to_status)) {
    throw badRequest('状态 ' + before.status + ' 不能流转到 ' + to_status + '。允许的下一状态：' + getValidNextStatuses(before.status).join(', '));
  }

  db.prepare(`
    UPDATE recommendations SET status = ?, last_status_change_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(to_status, recId);
  db.prepare(`
    INSERT INTO recommendation_status_history (recommendation_id, from_status, to_status, changed_by_user_id, changed_by_username, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recId, before.status, to_status, req.user.id, req.user.displayName || req.user.username, note || '');

  const row = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(recId);
  auditService.log(req.user.id, 'CHANGE_RECOMMENDATION_STATUS', 'recommendation', recId, { from: before.status, to: to_status, note }, req.ip);
  res.json(success(row));
}));

/**
 * DELETE /api/v1/recommendations/:id
 * 软删除
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const recId = parseInt(req.params.id);
  if (!recId) throw badRequest('无效的推荐 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(recId);
  if (!before || before.deleted_at) throw notFound('推荐记录不存在');
  if (req.user.role !== 'admin' && before.recommend_user_id !== req.user.id) {
    throw notFound('推荐记录不存在或无权操作');
  }
  const result = db.prepare('UPDATE recommendations SET deleted_at = datetime(\'now\') WHERE id = ?').run(recId);
  if (result.changes === 0) throw notFound('推荐记录不存在或无权操作');
  auditService.log(req.user.id, 'DELETE_recommendation', 'recommendation', recId, null, req.ip);
  res.json(success({ id: recId, deleted: true }));
}));

// 导出供 BFF 启动时调用
function scanOverdueRecommendations() {
  const db = getDb();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
  // ===== P1-2 修复：用 COALESCE(last_status_change_at, recommend_at) 兼容老数据 =====
  // 老记录 last_status_change_at 为 NULL 时回退到 recommend_at；
  // 状态变更后 last_status_change_at 有值，下次扫描不会被重复处理
  const overdue = db.prepare(
    `SELECT * FROM recommendations
     WHERE status = 'recommended' AND deleted_at IS NULL
       AND COALESCE(last_status_change_at, recommend_at) < ?`
  ).all(threeDaysAgo);
  // ===== 修复结束 =====
  let processed = 0, tasks_created = 0;
  // 不用事务（sql.js 的 db.exec 会自动管理，每个 statement 独立）
  overdue.forEach(function (rec) {
    try {
      db.prepare(`UPDATE recommendations SET status = 'pending_feedback', last_status_change_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(rec.id);
      db.prepare(`INSERT INTO recommendation_status_history (recommendation_id, from_status, to_status, changed_by_username, note) VALUES (?, ?, ?, ?, ?)`).run(rec.id, 'recommended', 'pending_feedback', 'system', '自动转换：推荐已 3 天未收到客户反馈');
      const r = db.prepare(`INSERT INTO tasks (title, "desc", priority, due_date, user_id) VALUES (?, ?, ?, ?, ?)`).run(
        '跟进推荐反馈：' + (rec.job_title || '未命名职位'),
        '推荐已 3 天无客户反馈，请尽快跟进。候选人 ID: ' + rec.candidate_id,
        'high',
        new Date().toISOString().slice(0, 10),
        rec.recommend_user_id
      );
      if (r.changes > 0) tasks_created++;
      processed++;
    } catch (e) {
      console.error('scanOverdue: failed rec ' + rec.id, e.message);
    }
  });
  return { processed: processed, tasks_created: tasks_created };
}

router.scanOverdueRecommendations = scanOverdueRecommendations;

module.exports = router;
