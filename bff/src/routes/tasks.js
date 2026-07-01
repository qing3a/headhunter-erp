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
  const { status, priority } = req.query;
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
  if (status) { where.push('status = ?'); params.push(status); }
  if (priority) { where.push('priority = ?'); params.push(priority); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM tasks ${whereSql}`).get(...params).cnt;
  const rows = db.prepare(`
    SELECT * FROM tasks ${whereSql}
    ORDER BY
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json(pagination(rows, total, page, pageSize));
});

router.post('/', (req, res) => {
  const { title, desc, priority, status, due_date } = req.body || {};
  if (!title) throw badRequest('任务标题不能为空');
  const db = getDb();

  db.prepare(`
    INSERT INTO tasks (title, "desc", priority, status, due_date, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    title,
    desc || '',
    priority || 'medium',
    status || 'pending',
    due_date || '',
    req.user.id
  );

  const row = db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 1').get();
  auditService.log(req.user.id, 'CREATE_task', 'task', row?.id, req.body, req.ip);
  res.json(success(row));
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const db = getDb();

  const before = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!before) throw notFound('任务不存在');

  const next = {
    title: body.title !== undefined ? body.title : before.title,
    desc: body.desc !== undefined ? body.desc : before.desc,
    priority: body.priority !== undefined ? body.priority : before.priority,
    status: body.status !== undefined ? body.status : before.status,
    due_date: body.due_date !== undefined ? body.due_date : before.due_date,
  };

  const result = db.prepare(`
    UPDATE tasks
    SET title = ?, "desc" = ?, priority = ?, status = ?, due_date = ?,
        updated_at = datetime('now')
    WHERE id = ? AND (user_id = ? OR ? = 'admin') AND deleted_at IS NULL
  `).run(next.title, next.desc, next.priority, next.status, next.due_date, id, req.user.id, req.user.role);
  if (result.changes === 0) throw notFound('任务不存在或无权操作');

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  auditService.log(req.user.id, 'UPDATE_task', 'task', Number(id), { before, after: row }, req.ip);
  res.json(success(row));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const before = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!before) throw notFound('任务不存在');

  const result = db.prepare(`
    UPDATE tasks SET deleted_at = datetime('now')
    WHERE id = ? AND (user_id = ? OR ? = 'admin') AND deleted_at IS NULL
  `).run(id, req.user.id, req.user.role);
  if (result.changes === 0) throw notFound('任务不存在或无权操作');

  auditService.log(req.user.id, 'DELETE_task', 'task', Number(id), null, req.ip);
  res.json(success({ id: Number(id), deleted: true }));
});

module.exports = router;