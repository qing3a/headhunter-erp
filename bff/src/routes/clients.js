const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { success, pagination } = require('../utils/response');
const { badRequest, notFound } = require('../utils/errors');
const auditService = require('../services/auditService');
const { getDb } = require('../db/init');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const { keyword } = req.query;
  const isAdmin = req.user.role === 'admin';
  const includeDeleted = req.query.includeDeleted === 'true' && isAdmin;
  const db = getDb();

  const where = [];
  const params = [];
  if (!includeDeleted) where.push('deleted_at IS NULL');
  if (!isAdmin) {
    where.push('owner_user_id = ?');
    params.push(req.user.id);
  }
  if (keyword) {
    where.push('(name LIKE ? OR contact_name LIKE ? OR industry LIKE ?)');
    const kw = '%' + keyword + '%';
    params.push(kw, kw, kw);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare('SELECT COUNT(*) AS cnt FROM clients ' + whereSql).get(...params).cnt;
  const rows = db.prepare('SELECT * FROM clients ' + whereSql + ' ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(...params, pageSize, offset);
  res.json(pagination(rows, total, page, pageSize));
}));

router.get('/lookup', asyncHandler(async (req, res) => {
  const db = getDb();
  const isAdmin = req.user.role === 'admin';
  const where = isAdmin ? 'deleted_at IS NULL AND status = ?' : 'deleted_at IS NULL AND status = ? AND owner_user_id = ?';
  const params = isAdmin ? ['active'] : ['active', req.user.id];
  const rows = db.prepare(
    'SELECT id, name, contact_name, industry FROM clients WHERE ' + where + ' ORDER BY name LIMIT 200'
  ).all(...params);
  res.json(success(rows));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) throw badRequest('无效的 ID');
  const db = getDb();
  const isAdmin = req.user.role === 'admin';
  const sql = isAdmin
    ? 'SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL'
    : 'SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL AND owner_user_id = ?';
  const params = isAdmin ? [id] : [id, req.user.id];
  const client = db.prepare(sql).get(...params);
  if (!client) throw notFound('客户不存在');
  const notes = db.prepare('SELECT * FROM client_notes WHERE client_id = ? ORDER BY created_at DESC').all(id);
  res.json(success({ ...client, notes }));
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.name || !String(body.name).trim()) throw badRequest('客户名称必填');
  const db = getDb();
  db.prepare(`
    INSERT INTO clients
      (name, industry, city, contact_name, contact_email, contact_phone, website, notes, status, owner_user_id, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(body.name).trim(),
    body.industry || null,
    body.city || null,
    body.contact_name || null,
    body.contact_email || null,
    body.contact_phone || null,
    body.website || null,
    body.notes || null,
    body.status || 'active',
    req.user.id,
    'local'
  );
  const row = db.prepare('SELECT * FROM clients ORDER BY id DESC LIMIT 1').get();
  auditService.log(req.user.id, 'CREATE_client', 'client', row.id, body, req.ip);
  res.json(success(row));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) throw badRequest('无效的 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!before || before.deleted_at) throw notFound('客户不存在');
  if (req.user.role !== 'admin' && before.owner_user_id !== req.user.id) {
    throw notFound('客户不存在或无权操作');
  }
  const body = req.body || {};
  const next = {
    name: body.name !== undefined ? String(body.name).trim() : before.name,
    industry: body.industry !== undefined ? body.industry : before.industry,
    city: body.city !== undefined ? body.city : before.city,
    contact_name: body.contact_name !== undefined ? body.contact_name : before.contact_name,
    contact_email: body.contact_email !== undefined ? body.contact_email : before.contact_email,
    contact_phone: body.contact_phone !== undefined ? body.contact_phone : before.contact_phone,
    website: body.website !== undefined ? body.website : before.website,
    notes: body.notes !== undefined ? body.notes : before.notes,
    status: body.status !== undefined ? body.status : before.status,
  };
  if (!next.name) throw badRequest('客户名称不能为空');
  const result = db.prepare(`
    UPDATE clients SET
      name = ?, industry = ?, city = ?, contact_name = ?, contact_email = ?,
      contact_phone = ?, website = ?, notes = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(next.name, next.industry, next.city, next.contact_name, next.contact_email,
         next.contact_phone, next.website, next.notes, next.status, id);
  if (result.changes === 0) throw notFound('客户不存在或无权操作');
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  auditService.log(req.user.id, 'UPDATE_client', 'client', id, { before, after: row }, req.ip);
  res.json(success(row));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) throw badRequest('无效的 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!before || before.deleted_at) throw notFound('客户不存在');
  if (req.user.role !== 'admin' && before.owner_user_id !== req.user.id) {
    throw notFound('客户不存在或无权操作');
  }
  const result = db.prepare('UPDATE clients SET deleted_at = datetime(\'now\') WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('客户不存在或无权操作');
  auditService.log(req.user.id, 'DELETE_client', 'client', id, null, req.ip);
  res.json(success({ id, deleted: true }));
}));

router.get('/:id/notes', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const notes = db.prepare('SELECT * FROM client_notes WHERE client_id = ? ORDER BY created_at DESC').all(id);
  res.json(success(notes));
}));

router.post('/:id/notes', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { content, follow_up } = req.body || {};
  if (!content) throw badRequest('备注内容不能为空');
  const db = getDb();
  db.prepare('INSERT INTO client_notes (client_id, content, follow_up, user_id) VALUES (?, ?, ?, ?)')
    .run(id, content, follow_up || '', req.user.id);
  const note = db.prepare('SELECT * FROM client_notes ORDER BY id DESC LIMIT 1').get();
  auditService.log(req.user.id, 'CREATE_client_note', 'client_note', note.id, req.body, req.ip);
  res.json(success(note));
}));

router.put('/:id/notes/:nid', asyncHandler(async (req, res) => {
  const nid = parseInt(req.params.nid);
  const { content, follow_up } = req.body || {};
  if (!content) throw badRequest('备注内容不能为空');
  const db = getDb();
  const before = db.prepare('SELECT * FROM client_notes WHERE id = ?').get(nid);
  if (!before) throw notFound('备注不存在');
  if (req.user.role !== 'admin' && before.user_id !== req.user.id) {
    throw notFound('备注不存在或无权操作');
  }
  db.prepare('UPDATE client_notes SET content = ?, follow_up = ? WHERE id = ?').run(content, follow_up || '', nid);
  const note = db.prepare('SELECT * FROM client_notes WHERE id = ?').get(nid);
  auditService.log(req.user.id, 'UPDATE_client_note', 'client_note', nid, { before, after: note }, req.ip);
  res.json(success(note));
}));

router.delete('/:id/notes/:nid', asyncHandler(async (req, res) => {
  const nid = parseInt(req.params.nid);
  const db = getDb();
  const before = db.prepare('SELECT * FROM client_notes WHERE id = ?').get(nid);
  if (!before) throw notFound('备注不存在');
  if (req.user.role !== 'admin' && before.user_id !== req.user.id) {
    throw notFound('备注不存在或无权操作');
  }
  db.prepare('DELETE FROM client_notes WHERE id = ?').run(nid);
  auditService.log(req.user.id, 'DELETE_client_note', 'client_note', nid, null, req.ip);
  res.json(success({ id: nid, deleted: true }));
}));

module.exports = router;
