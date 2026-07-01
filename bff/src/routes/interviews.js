const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { success, pagination } = require('../utils/response');
const { notFound, badRequest } = require('../utils/errors');
const auditService = require('../services/auditService');
const { getDb } = require('../db/init');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const { keyword, status, from, to } = req.query;
  const isAdmin = req.user.role === 'admin';
  const includeDeleted = req.query.includeDeleted === 'true' && isAdmin;
  const db = getDb();

  const where = [];
  const params = [];
  if (!includeDeleted) where.push('deleted_at IS NULL');
  if (!isAdmin) {
    where.push('user_id = ?');
    params.push(req.user.id);
  }
  if (keyword) {
    where.push('(candidate_name LIKE ? OR job_title LIKE ? OR client_name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) { where.push('status = ?'); params.push(status); }
  if (from) { where.push('scheduled_at >= ?'); params.push(from); }
  if (to) { where.push('scheduled_at <= ?'); params.push(to); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM interviews ${whereSql}`).get(...params).cnt;
  const rows = db.prepare(
    `SELECT * FROM interviews ${whereSql} ORDER BY scheduled_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset);

  res.json(pagination(rows, total, page, pageSize));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const isAdmin = req.user.role === 'admin';
  const sql = isAdmin
    ? 'SELECT * FROM interviews WHERE id = ? AND deleted_at IS NULL'
    : 'SELECT * FROM interviews WHERE id = ? AND user_id = ? AND deleted_at IS NULL';
  const params = isAdmin ? [req.params.id] : [req.params.id, req.user.id];
  const row = db.prepare(sql).get(...params);
  if (!row) throw notFound('面试不存在');
  res.json(success(row));
});

router.post('/', (req, res) => {
  const {
    candidate_name,
    job_title,
    client_name,
    interviewer,
    scheduled_at,
    type,
    status,
    note,
    candidate_id,
    job_id,
  } = req.body || {};
  if (!candidate_name) throw badRequest('候选人姓名不能为空');

  const db = getDb();
  db.prepare(`
    INSERT INTO interviews
      (candidate_name, job_title, client_name, interviewer, scheduled_at, type, status, note, candidate_id, job_id, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    candidate_name,
    job_title || '',
    client_name || '',
    interviewer || '',
    scheduled_at || '',
    type || 'video',
    status || 'scheduled',
    note || '',
    candidate_id || '',
    job_id || '',
    req.user.id
  );

  const row = db.prepare('SELECT * FROM interviews ORDER BY id DESC LIMIT 1').get();
  auditService.log(req.user.id, 'CREATE_interview', 'interview', row?.id, req.body, req.ip);
  res.json(success(row));
});

const asyncHandler = require('../utils/asyncHandler');

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) throw badRequest('无效的 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM interviews WHERE id = ?').get(id);
  if (!before || before.deleted_at) throw notFound('面试不存在');
  // ===== P0-NEW-4 修复：先 SELECT 验证权限（绕过 sql.js 谓词 bug）=====
  if (req.user.role !== 'admin' && before.user_id !== req.user.id) {
    throw notFound('面试不存在或无权操作');
  }
  // ===== 修复结束 =====
  const body = req.body || {};
  const next = {
    candidate_name: body.candidate_name !== undefined ? body.candidate_name : before.candidate_name,
    job_title: body.job_title !== undefined ? body.job_title : before.job_title,
    client_name: body.client_name !== undefined ? body.client_name : before.client_name,
    interviewer: body.interviewer !== undefined ? body.interviewer : before.interviewer,
    scheduled_at: body.scheduled_at !== undefined ? body.scheduled_at : before.scheduled_at,
    type: body.type !== undefined ? body.type : before.type,
    status: body.status !== undefined ? body.status : before.status,
    note: body.note !== undefined ? body.note : before.note,
    candidate_id: body.candidate_id !== undefined ? body.candidate_id : before.candidate_id,
    job_id: body.job_id !== undefined ? body.job_id : before.job_id,
  };
  const result = db.prepare(`
    UPDATE interviews
    SET candidate_name = ?, job_title = ?, client_name = ?, interviewer = ?,
        scheduled_at = ?, type = ?, status = ?, note = ?, candidate_id = ?, job_id = ?,
        updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(
    next.candidate_name,
    next.job_title,
    next.client_name,
    next.interviewer,
    next.scheduled_at,
    next.type,
    next.status,
    next.note,
    next.candidate_id,
    next.job_id,
    id
  );
  if (result.changes === 0) throw notFound('面试不存在或无权操作');
  const row = db.prepare('SELECT * FROM interviews WHERE id = ?').get(id);
  auditService.log(req.user.id, 'UPDATE_interview', 'interview', id, { before, after: row }, req.ip);
  res.json(success(row));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) throw badRequest('无效的 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM interviews WHERE id = ?').get(id);
  if (!before || before.deleted_at) throw notFound('面试不存在');
  // ===== P0-NEW-4 修复：先 SELECT 验证权限 =====
  if (req.user.role !== 'admin' && before.user_id !== req.user.id) {
    throw notFound('面试不存在或无权操作');
  }
  // ===== 修复结束 =====
  const result = db.prepare(`
    UPDATE interviews SET deleted_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(id);
  if (result.changes === 0) throw notFound('面试不存在或无权操作');
  auditService.log(req.user.id, 'DELETE_interview', 'interview', id, null, req.ip);
  res.json(success({ id, deleted: true }));
}));

module.exports = router;