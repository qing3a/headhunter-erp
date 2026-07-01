const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');
const { success, pagination } = require('../utils/response');
const { badRequest, notFound, conflict } = require('../utils/errors');
const auditService = require('../services/auditService');
const asyncHandler = require('../utils/asyncHandler');
const { getDb } = require('../db/init');
const platformApi = require('../services/platformApi');

const router = express.Router();
router.use(requireAuth);

// ============================================================
// 职位（本地表为主，PLATFORM_API 仅作 sync 辅助）
// ============================================================

/**
 * GET /api/v1/jobs
 * 列表（分页 + 搜索 + 筛选 + user_id 过滤）
 */
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const { keyword, status, city, industry, owner_only } = req.query;
  const isAdmin = req.user.role === 'admin';
  const includeDeleted = req.query.includeDeleted === 'true' && isAdmin;
  const db = getDb();

  const where = [];
  const params = [];
  if (!includeDeleted) where.push('deleted_at IS NULL');
  // owner_only=true：只看自己创建的；否则默认看自己的 + admin 看全部
  if (owner_only === 'true' || !isAdmin) {
    where.push('owner_user_id = ?');
    params.push(req.user.id);
  }
  if (keyword) {
    where.push('(title LIKE ? OR company LIKE ? OR description LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (status) { where.push('status = ?'); params.push(status); }
  if (city) { where.push('city = ?'); params.push(city); }
  if (industry) { where.push('industry = ?'); params.push(industry); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM jobs ${whereSql}`).get(...params).cnt;
  const rows = db.prepare(
    `SELECT * FROM jobs ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset);
  res.json(pagination(rows, total, page, pageSize));
}));

/**
 * GET /api/v1/jobs/lookup
 * 前端选择职位时下拉用：返回 id + title + company
 * Query: keyword（可选，按 title 模糊）
 */
router.get('/lookup', asyncHandler(async (req, res) => {
  const { keyword } = req.query;
  const db = getDb();
  let rows;
  if (keyword) {
    rows = db.prepare(
      `SELECT id, title, company, city FROM jobs
       WHERE deleted_at IS NULL AND status != 'closed' AND title LIKE ?
       ORDER BY updated_at DESC LIMIT 50`
    ).all('%' + keyword + '%');
  } else {
    rows = db.prepare(
      `SELECT id, title, company, city FROM jobs
       WHERE deleted_at IS NULL AND status != 'closed'
       ORDER BY updated_at DESC LIMIT 50`
    ).all();
  }
  res.json(success(rows));
}));

/**
 * GET /api/v1/jobs/sync-from-platform
 * 从 PLATFORM_API 拉取职位同步到本地（admin only）
 * 不可达时返回 partial success
 * 注意：必须在 GET /:id 之前注册
 */
router.get('/sync-from-platform', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await platformApi.jobs.list({ page: 1, pageSize: 100 });
  if (!result || !result.ok) {
    return res.json(success({ synced: 0, error: 'PLATFORM_API 不可达', inserted: 0, skipped: 0 }));
  }
  const data = result.data || [];
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO jobs
      (external_id, title, company, city, industry, salary_min, salary_max, status, owner_user_id, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'platform')
  `);
  let inserted = 0, skipped = 0;
  db.exec('BEGIN');
  try {
    data.forEach(function (j) {
      const eid = j.id || j._id || null;
      const r = insert.run(
        eid,
        j.title || j.name || '(无标题)',
        j.employer_name || j.company || null,
        j.city || null,
        j.industry || null,
        parseInt(j.salary_min) || null,
        parseInt(j.salary_max) || null,
        j.status || 'open',
        req.user.id
      );
      if (r.changes > 0) inserted++; else skipped++;
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  auditService.log(req.user.id, 'SYNC_jobs', 'job', null, { inserted, skipped, total: data.length }, req.ip);
  res.json(success({ synced: data.length, inserted, skipped, source: 'platform' }));
}));

/**
 * GET /api/v1/jobs/:id
 * 详情
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.id);
  if (!jobId) throw badRequest('无效的职位 ID');
  const db = getDb();
  const row = db.prepare('SELECT * FROM jobs WHERE id = ? AND deleted_at IS NULL').get(jobId);
  if (!row) throw notFound('职位不存在');
  res.json(success(row));
}));

/**
 * POST /api/v1/jobs
 * 创建
 */
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.title || !String(body.title).trim()) throw badRequest('职位标题不能为空');
  const db = getDb();
  db.prepare(`
    INSERT INTO jobs
      (title, company, department, city, industry,
       salary_min, salary_max, experience_min, experience_max, education_level,
       description, status, owner_user_id, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(body.title).trim(),
    body.company || null,
    body.department || null,
    body.city || null,
    body.industry || null,
    parseInt(body.salary_min) || null,
    parseInt(body.salary_max) || null,
    parseInt(body.experience_min) || null,
    parseInt(body.experience_max) || null,
    body.education_level || null,
    body.description || null,
    body.status || 'open',
    req.user.id,
    'local'
  );
  const row = db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT 1').get();
  auditService.log(req.user.id, 'CREATE_job', 'job', row.id, body, req.ip);
  res.json(success(row));
}));

/**
 * PUT /api/v1/jobs/:id
 * 更新（先 SELECT 验证权限，绕过 sql.js 谓词 bug）
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.id);
  if (!jobId) throw badRequest('无效的职位 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!before || before.deleted_at) throw notFound('职位不存在');
  if (req.user.role !== 'admin' && before.owner_user_id !== req.user.id) {
    throw notFound('职位不存在或无权操作');
  }
  const body = req.body || {};
  const next = {
    title: body.title !== undefined ? String(body.title).trim() : before.title,
    company: body.company !== undefined ? body.company : before.company,
    department: body.department !== undefined ? body.department : before.department,
    city: body.city !== undefined ? body.city : before.city,
    industry: body.industry !== undefined ? body.industry : before.industry,
    salary_min: body.salary_min !== undefined ? (parseInt(body.salary_min) || null) : before.salary_min,
    salary_max: body.salary_max !== undefined ? (parseInt(body.salary_max) || null) : before.salary_max,
    experience_min: body.experience_min !== undefined ? (parseInt(body.experience_min) || null) : before.experience_min,
    experience_max: body.experience_max !== undefined ? (parseInt(body.experience_max) || null) : before.experience_max,
    education_level: body.education_level !== undefined ? body.education_level : before.education_level,
    description: body.description !== undefined ? body.description : before.description,
    status: body.status !== undefined ? body.status : before.status,
  };
  const result = db.prepare(`
    UPDATE jobs SET
      title = ?, company = ?, department = ?, city = ?, industry = ?,
      salary_min = ?, salary_max = ?, experience_min = ?, experience_max = ?, education_level = ?,
      description = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    next.title, next.company, next.department, next.city, next.industry,
    next.salary_min, next.salary_max, next.experience_min, next.experience_max, next.education_level,
    next.description, next.status, jobId
  );
  if (result.changes === 0) throw notFound('职位不存在或无权操作');
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  auditService.log(req.user.id, 'UPDATE_job', 'job', jobId, { before, after: row }, req.ip);
  res.json(success(row));
}));

/**
 * DELETE /api/v1/jobs/:id
 * 软删除
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.id);
  if (!jobId) throw badRequest('无效的职位 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!before || before.deleted_at) throw notFound('职位不存在');
  if (req.user.role !== 'admin' && before.owner_user_id !== req.user.id) {
    throw notFound('职位不存在或无权操作');
  }
  const result = db.prepare(`
    UPDATE jobs SET deleted_at = datetime('now')
    WHERE id = ?
  `).run(jobId);
  if (result.changes === 0) throw notFound('职位不存在或无权操作');
  auditService.log(req.user.id, 'DELETE_job', 'job', jobId, null, req.ip);
  res.json(success({ id: jobId, deleted: true }));
}));

module.exports = router;

