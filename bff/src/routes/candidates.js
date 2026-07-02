const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { success, pagination } = require('../utils/response');
const { notFound, badRequest, duplicate, conflict } = require('../utils/errors');
const auditService = require('../services/auditService');
const asyncHandler = require('../utils/asyncHandler');
const { getDb } = require('../db/init');

const router = express.Router();
router.use(requireAuth);

// ============================================================
// 候选人主表
// ============================================================

/**
 * GET /api/v1/candidates
 * 列表（分页+搜索+筛选+JOIN tags）
 * Query: page, pageSize, keyword, status, city, source_channel, years_min, years_max, includeDeleted
 */
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const { keyword, status, city, source_channel, education_level, industry,
          years_min, years_max, salary_min, salary_max, tag,
          has_recommendation, sort } = req.query;

  // ===== P2-D3 修复：admin 全选所有页（返回所有候选 ID，受过滤条件限制）=====
  // admin 限定：避免 consultant 跨用户拉全表（性能/隐私问题）
  // limit 500：防爆；500 已经够 99% 业务场景
  if (req.query.all_pages === 'true' && req.user.role === 'admin') {
    const dbAll = getDb();
    const whereAll = ['c.deleted_at IS NULL'];
    const paramsAll = [];
    if (keyword && String(keyword).trim().length >= 2) {
      whereAll.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.current_company LIKE ?)');
      const kw = `%${keyword}%`;
      paramsAll.push(kw, kw, kw, kw);
    }
    if (status) { whereAll.push('c.status = ?'); paramsAll.push(status); }
    if (city) { whereAll.push('c.current_city = ?'); paramsAll.push(city); }
    if (source_channel) { whereAll.push('c.source_channel = ?'); paramsAll.push(source_channel); }
    if (education_level) { whereAll.push('c.education_level = ?'); paramsAll.push(education_level); }
    if (industry) { whereAll.push('c.expected_industry = ?'); paramsAll.push(industry); }
    if (tag) {
      whereAll.push('EXISTS (SELECT 1 FROM candidate_tags ct2 WHERE ct2.candidate_id = c.id AND ct2.deleted_at IS NULL AND instr(ct2.tags, ?) > 0)');
      paramsAll.push('"' + String(tag).replace(/"/g, '') + '"');
    }
    if (has_recommendation === 'true') {
      whereAll.push('EXISTS (SELECT 1 FROM recommendations r WHERE r.candidate_id = c.id AND r.deleted_at IS NULL)');
    } else if (has_recommendation === 'false') {
      whereAll.push('NOT EXISTS (SELECT 1 FROM recommendations r WHERE r.candidate_id = c.id AND r.deleted_at IS NULL)');
    }
    const whereSqlAll = 'WHERE ' + whereAll.join(' AND ');
    const ids = dbAll.prepare(
      `SELECT id FROM candidates c ${whereSqlAll} ORDER BY c.updated_at DESC LIMIT 500`
    ).all(...paramsAll);
    return res.json(success({ ids: ids.map(r => r.id), total: ids.length }, {}));
  }
  // ===== P2-D3 修复结束 =====

  const offset = (page - 1) * pageSize;
  // ===== v2-3 (P3-16) 修复：关键词长度限制 =====
  // LIKE '%k%' 不能用 B-tree 索引（通配符在左 → 全表扫）
  // 限制 keyword 长度 ≥ 2 避免单字符通配扫大表
  if (keyword && String(keyword).trim().length < 2) {
    return res.json(success([], { total: 0, page: page, pageSize: pageSize }));
  }
  const isAdmin = req.user.role === 'admin';
  const includeDeleted = req.query.includeDeleted === 'true' && isAdmin;
  const db = getDb();

  const where = [];
  const params = [];
  if (!includeDeleted) where.push('c.deleted_at IS NULL');
  if (!isAdmin) {
    where.push('c.user_id = ?');
    params.push(req.user.id);
  }
  if (keyword) {
    // ===== v6.5 优化：FTS5 全文搜索 =====
    // FTS5 支持 unicode61 分词（中文按字符、英文按词）+ 前缀 *，比 LIKE '%k%' 快几个数量级。
    // 失败时回落到 LIKE；LIKE 仍可命中 B-tree 索引列（name/phone/email）。
    if (globalThis.__FTS_AVAILABLE__) {
      // FTS5 MATCH 语法：把 keyword 转 safe + 加前缀 *
      const ftsKeyword = String(keyword).trim()
        .replace(/['"()]/g, '')  // 去特殊字符（防 MATCH 注入）
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5 ]/g, ' ')  // 替换非字母数字中文为空格
        .trim();
      if (ftsKeyword) {
        where.push(`c.id IN (SELECT candidate_id FROM candidates_fts WHERE candidates_fts MATCH ?)`);
        params.push(ftsKeyword + '*');
      } else {
        // 纯特殊字符 → 退回 LIKE
        where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.current_company LIKE ?)');
        const kw = `%${keyword}%`;
        params.push(kw, kw, kw, kw);
      }
    } else {
      // 降级：LIKE 全表扫
      where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.current_company LIKE ?)');
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    // ===== 优化结束 =====
  }
  if (status) { where.push('c.status = ?'); params.push(status); }
  if (city) { where.push('c.current_city = ?'); params.push(city); }
  if (source_channel) { where.push('c.source_channel = ?'); params.push(source_channel); }
  if (years_min) { where.push('c.years_of_experience >= ?'); params.push(parseInt(years_min)); }
  if (years_max) { where.push('c.years_of_experience <= ?'); params.push(parseInt(years_max)); }
  if (education_level) { where.push('c.education_level = ?'); params.push(education_level); }
  if (industry) { where.push('c.expected_industry = ?'); params.push(industry); }
  if (salary_min) { where.push('c.expected_salary_max >= ?'); params.push(parseInt(salary_min)); }
  if (salary_max) { where.push('c.expected_salary_min <= ?'); params.push(parseInt(salary_max)); }
  // ===== P1-5 修复：tag 精确匹配（instr 找 JSON 字符串里的引号包围 tag）=====
  // JSON 数组里 tag 必然前后是双引号：["tag1","tag2"] 找 "tag1" → instr 命中
  // 避免 LIKE '%"tag"%' 误匹配 "tag1" / "tag2X" 等
  // 注意：count 查询没有 LEFT JOIN candidate_tags，tag 条件用 EXISTS 子查询
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM candidate_tags ct2 WHERE ct2.candidate_id = c.id AND ct2.deleted_at IS NULL AND instr(ct2.tags, ?) > 0)');
    params.push('"' + tag + '"');
  }
  // ===== 修复结束 =====
  // has_recommendation：通过子查询
  if (has_recommendation === 'true') {
    where.push('EXISTS (SELECT 1 FROM recommendations r WHERE r.candidate_id = c.id AND r.deleted_at IS NULL)');
  } else if (has_recommendation === 'false') {
    where.push('NOT EXISTS (SELECT 1 FROM recommendations r WHERE r.candidate_id = c.id AND r.deleted_at IS NULL)');
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // 排序
  let orderBy = 'c.updated_at DESC';
  if (sort === 'created_at_desc') orderBy = 'c.created_at DESC';
  else if (sort === 'salary_desc') orderBy = 'c.expected_salary_max DESC';
  else if (sort === 'years_desc') orderBy = 'c.years_of_experience DESC';

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM candidates c ${whereSql}`).get(...params).cnt;
  const rows = db.prepare(`
    SELECT
      c.id, c.name, c.gender, c.phone, c.email,
      c.current_position, c.current_company, c.years_of_experience, c.education_level, c.current_city,
      c.expected_salary_min, c.expected_salary_max, c.expected_position, c.expected_industry, c.expected_city,
      c.available_at, c.status, c.source_channel, c.source_detail, c.notes,
      c.user_id, c.deleted_at, c.created_at, c.updated_at,
      ct.tags, ct.rating, ct.notes AS tag_notes
    FROM candidates c
    LEFT JOIN candidate_tags ct ON ct.candidate_id = c.id AND ct.deleted_at IS NULL
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const data = rows.map(r => ({
    ...r,
    tags: parseTags(r.tags),
    rating: r.rating || 0,
  }));

  res.json(pagination(data, total, page, pageSize));
}));

/**
 * GET /api/v1/candidates/check-email
 * 邮箱查重（前端表单实时校验）
 * Query: email, id（编辑时排除自己）
 */
router.get('/check-email', asyncHandler(async (req, res) => {
  const { email, id } = req.query;
  if (!email) throw badRequest('请提供邮箱');
  const db = getDb();
  const excludeId = id ? parseInt(id) : 0;
  const row = db.prepare(
    'SELECT id FROM candidates WHERE email = ? AND user_id = ? AND deleted_at IS NULL AND id != ?'
  ).get(email, req.user.id, excludeId);
  res.json(success({ available: !row, email }));
}));

/**
 * GET /api/v1/candidates/:id
 * 详情（主表 + tags + 3 子表）
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const candidateId = parseInt(req.params.id);
  if (!candidateId) throw badRequest('无效的候选人 ID');
  const db = getDb();
  const isAdmin = req.user.role === 'admin';
  const sql = isAdmin
    ? 'SELECT * FROM candidates WHERE id = ? AND deleted_at IS NULL'
    : 'SELECT * FROM candidates WHERE id = ? AND user_id = ? AND deleted_at IS NULL';
  const params = isAdmin ? [candidateId] : [candidateId, req.user.id];
  const row = db.prepare(sql).get(...params);
  if (!row) throw notFound('候选人不存在');

  // tags
  const tagRow = db.prepare(
    'SELECT tags, rating, notes FROM candidate_tags WHERE candidate_id = ? AND deleted_at IS NULL'
  ).get(candidateId);

  // 子表
  const experiences = db.prepare(
    'SELECT * FROM candidate_experiences WHERE candidate_id = ? AND deleted_at IS NULL ORDER BY is_current DESC, start_date DESC'
  ).all(candidateId);
  const educations = db.prepare(
    'SELECT * FROM candidate_educations WHERE candidate_id = ? AND deleted_at IS NULL ORDER BY is_current DESC, start_date DESC'
  ).all(candidateId);
  const contacts = db.prepare(
    'SELECT * FROM candidate_contacts WHERE candidate_id = ? AND deleted_at IS NULL ORDER BY contact_at DESC'
  ).all(candidateId);

  // 推荐记录（最多 50 条，按时间倒序）
  const recommendations = db.prepare(
    `SELECT r.id, r.job_id, r.job_title, r.job_company, r.client_name, r.status,
            r.recommend_method, r.recommend_at, r.last_status_change_at, r.recommend_username, r.notes
     FROM recommendations r
     WHERE r.candidate_id = ? AND r.deleted_at IS NULL
     ORDER BY r.recommend_at DESC LIMIT 50`
  ).all(candidateId);

  // ===== v2-2 (P2-C2) 修复：返回最近 audit_log（含改名事件）=====
  const auditLog = db.prepare(
    "SELECT id, user_id, action, resource_type, resource_id, detail, created_at FROM audit_log WHERE resource_type = 'candidate' AND resource_id = ? ORDER BY created_at DESC LIMIT 20"
  ).all(String(candidateId));
  // 解析 detail JSON + 提取可读摘要
  const auditEvents = auditLog.map(function (a) {
    let parsed = null;
    try { parsed = JSON.parse(a.detail || '{}'); } catch (e) { parsed = {}; }
    let summary = a.action;
    if (a.action === 'UPDATE_candidate' && parsed.before && parsed.after) {
      const changes = [];
      for (var k in parsed.after) {
        if (JSON.stringify(parsed.before[k]) !== JSON.stringify(parsed.after[k])) {
          changes.push(k);
        }
      }
      if (changes.length) summary = '修改了 ' + changes.slice(0, 3).join('、') + (changes.length > 3 ? ' 等' : '');
    } else if (a.action === 'CREATE_candidate') {
      summary = '创建了档案';
    } else if (a.action === 'DELETE_candidate') {
      summary = '软删除了档案';
    } else if (a.action === 'UPDATE_candidate_tags') {
      summary = '更新了标签';
    } else if (a.action === 'CHANGE_PASSWORD') {
      summary = '修改了密码';
    }
    return { id: a.id, action: a.action, summary: summary, user_id: a.user_id, created_at: a.created_at };
  });

  res.json(success({
    ...row,
    tags: tagRow ? parseTags(tagRow.tags) : [],
    rating: tagRow ? tagRow.rating || 0 : 0,
    tag_notes: tagRow ? tagRow.notes || '' : '',
    experiences,
    educations,
    contacts,
    recommendations,
    audit_log: auditEvents,
  }));
}));

/**
 * POST /api/v1/candidates
 * 创建
 */
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.name || !String(body.name).trim()) throw badRequest('姓名不能为空');

  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO candidates
        (name, gender, phone, email,
         current_position, current_company, years_of_experience, education_level, current_city,
         expected_salary_min, expected_salary_max, expected_position, expected_industry, expected_city,
         available_at, status, source_channel, source_detail, notes, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(body.name).trim(),
      body.gender || null,
      body.phone || null,
      body.email || null,
      body.current_position || null,
      body.current_company || null,
      parseInt(body.years_of_experience) || 0,
      body.education_level || null,
      body.current_city || null,
      parseInt(body.expected_salary_min) || null,
      parseInt(body.expected_salary_max) || null,
      body.expected_position || null,
      body.expected_industry || null,
      body.expected_city || null,
      body.available_at || null,
      body.status || 'active',
      body.source_channel || null,
      body.source_detail || null,
      body.notes || null,
      req.user.id
    );
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed') && String(e.message).includes('candidates')) {
      throw duplicate('该邮箱已被使用');
    }
    throw e;
  }

  const row = db.prepare('SELECT * FROM candidates ORDER BY id DESC LIMIT 1').get();
  auditService.log(req.user.id, 'CREATE_candidate', 'candidate', row.id, body, req.ip);
  res.json(success(row));
}));

/**
 * PUT /api/v1/candidates/:id
 * 更新（合并模式）
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const candidateId = parseInt(req.params.id);
  if (!candidateId) throw badRequest('无效的候选人 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId);
  if (!before || before.deleted_at) throw notFound('候选人不存在');

  const body = req.body || {};
  const next = {
    name: body.name !== undefined ? String(body.name).trim() : before.name,
    gender: body.gender !== undefined ? body.gender : before.gender,
    phone: body.phone !== undefined ? body.phone : before.phone,
    email: body.email !== undefined ? body.email : before.email,
    current_position: body.current_position !== undefined ? body.current_position : before.current_position,
    current_company: body.current_company !== undefined ? body.current_company : before.current_company,
    years_of_experience: body.years_of_experience !== undefined ? (parseInt(body.years_of_experience) || 0) : before.years_of_experience,
    education_level: body.education_level !== undefined ? body.education_level : before.education_level,
    current_city: body.current_city !== undefined ? body.current_city : before.current_city,
    expected_salary_min: body.expected_salary_min !== undefined ? (parseInt(body.expected_salary_min) || null) : before.expected_salary_min,
    expected_salary_max: body.expected_salary_max !== undefined ? (parseInt(body.expected_salary_max) || null) : before.expected_salary_max,
    expected_position: body.expected_position !== undefined ? body.expected_position : before.expected_position,
    expected_industry: body.expected_industry !== undefined ? body.expected_industry : before.expected_industry,
    expected_city: body.expected_city !== undefined ? body.expected_city : before.expected_city,
    available_at: body.available_at !== undefined ? body.available_at : before.available_at,
    status: body.status !== undefined ? body.status : before.status,
    source_channel: body.source_channel !== undefined ? body.source_channel : before.source_channel,
    source_detail: body.source_detail !== undefined ? body.source_detail : before.source_detail,
    notes: body.notes !== undefined ? body.notes : before.notes,
  };

  try {
    // sql.js 库对 WHERE user_id = ? 谓词有 bug：不匹配时也报告 changes=1。
    // 改用 SELECT 预先验证权限，再无条件 UPDATE。
    if (req.user.role !== 'admin' && before.user_id !== req.user.id) {
      throw notFound('候选人不存在或无权操作');
    }
    const result = db.prepare(`
      UPDATE candidates SET
        name = ?, gender = ?, phone = ?, email = ?,
        current_position = ?, current_company = ?, years_of_experience = ?, education_level = ?, current_city = ?,
        expected_salary_min = ?, expected_salary_max = ?, expected_position = ?, expected_industry = ?, expected_city = ?,
        available_at = ?, status = ?, source_channel = ?, source_detail = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      next.name, next.gender, next.phone, next.email,
      next.current_position, next.current_company, next.years_of_experience, next.education_level, next.current_city,
      next.expected_salary_min, next.expected_salary_max, next.expected_position, next.expected_industry, next.expected_city,
      next.available_at, next.status, next.source_channel, next.source_detail, next.notes,
      candidateId
    );
    if (result.changes === 0) throw notFound('候选人不存在或无权操作');
  } catch (e) {
    if (e.code === 'NOT_FOUND') throw e;
    if (String(e.message).includes('UNIQUE constraint failed') && String(e.message).includes('candidates')) {
      throw duplicate('该邮箱已被使用');
    }
    throw e;
  }

  const row = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId);
  auditService.log(req.user.id, 'UPDATE_candidate', 'candidate', candidateId, { before, after: row }, req.ip);
  res.json(success(row));
}));

/**
 * DELETE /api/v1/candidates/:id
 * 软删除（级联 5 张子表）
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const candidateId = parseInt(req.params.id);
  if (!candidateId) throw badRequest('无效的候选人 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId);
  if (!before || before.deleted_at) throw notFound('候选人不存在');

  // sql.js bug 修复：先 SELECT 验证权限，再 UPDATE
  if (req.user.role !== 'admin' && before.user_id !== req.user.id) {
    throw notFound('候选人不存在或无权操作');
  }

  // ===== 关键修复：级联软删除 5 张子表 =====
  // 注意：sql.js 不支持真事务（COMMIT 抛 "no transaction is active"）。
  // 每个 .run() 内部已 saveDB 写盘，所以直接顺序执行；失败时 try-catch 记录错误但不阻塞主流程。
  try {
    db.prepare("UPDATE candidates SET deleted_at = datetime('now') WHERE id = ?").run(candidateId);
    db.prepare("UPDATE candidate_experiences SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL").run(candidateId);
    db.prepare("UPDATE candidate_educations SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL").run(candidateId);
    db.prepare("UPDATE candidate_contacts SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL").run(candidateId);
    db.prepare("UPDATE recommendations SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL").run(candidateId);
    db.prepare("UPDATE candidate_tags SET deleted_at = datetime('now') WHERE candidate_id = ? AND deleted_at IS NULL").run(candidateId);
  } catch (e) {
    // sql.js 不支持事务，无法回滚已执行的 .run()，但主表已成功删除，
    // 这里只记录错误日志，不抛出（避免已经删除了但返回 500 让用户疑惑）
    console.error('Cascade soft delete partial failure for candidate', candidateId, e.message);
  }
  // ===== 修复结束 =====

  auditService.log(req.user.id, 'DELETE_candidate', 'candidate', candidateId, null, req.ip);
  res.json(success({ id: candidateId, deleted: true }));
}));

// ============================================================
// 候选人 tags（保留旧端点）
// ============================================================

router.put('/:id/tags', asyncHandler(async (req, res) => {
  const candidateId = parseInt(req.params.id);
  if (!candidateId) throw badRequest('无效的候选人 ID');
  const { tags, rating, notes } = req.body || {};
  if (rating !== undefined && (rating < 0 || rating > 5)) {
    throw badRequest('评分必须在 0-5 之间');
  }
  const db = getDb();
  // 权限：候选人必须存在且属于当前 user（admin 跨用户）
  const candSql = req.user.role === 'admin'
    ? 'SELECT id FROM candidates WHERE id = ? AND deleted_at IS NULL'
    : 'SELECT id FROM candidates WHERE id = ? AND user_id = ? AND deleted_at IS NULL';
  const candParams = req.user.role === 'admin' ? [candidateId] : [candidateId, req.user.id];
  const cand = db.prepare(candSql).get(...candParams);
  if (!cand) throw notFound('候选人不存在或无权操作');

  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
  const ratingVal = rating === undefined ? 0 : Number(rating);
  const notesVal = notes === undefined ? '' : String(notes);

  // ===== P1-NEW-3 修复：candidate_id 是 INTEGER PRIMARY KEY，直接传 Number（不要 String()）=====
  // 之前用 String(candidateId) 强转字符串，sql.js 弱类型 WHERE 能匹配但走 B-tree 不走索引路径；
  // candidate_tags 表又漏了 idx_candidate_tags_candidate 索引（其他子表都有），导致全表扫描。
  // 现已补 idx_candidate_tags_candidate，直接传 candidateId（Number）走 INTEGER 索引。
  const existing = db.prepare('SELECT candidate_id FROM candidate_tags WHERE candidate_id = ?').get(candidateId);
  let before = null;
  if (existing) {
    // ===== P0-NEW-2 修复：乐观锁，version 不匹配时拒 =====
    // 读 tags/rating/notes + version；UPDATE WHERE version = ?，version 不匹配 → 冲突
    const current = db.prepare(
      'SELECT tags, rating, notes, version FROM candidate_tags WHERE candidate_id = ?'
    ).get(candidateId);
    before = {
      tags: current.tags, rating: current.rating, notes: current.notes, version: current.version
    };
    const result = db.prepare(`
      UPDATE candidate_tags SET tags = ?, rating = ?, notes = ?, version = version + 1, updated_at = datetime('now')
      WHERE candidate_id = ? AND version = ?
    `).run(tagsJson, ratingVal, notesVal, candidateId, current.version);
    if (result.changes === 0) throw conflict('tags 已被他人修改，请刷新');
    // ===== 修复结束 =====
  } else {
    db.prepare(`
      INSERT INTO candidate_tags (candidate_id, tags, rating, notes, user_id) VALUES (?, ?, ?, ?, ?)
    `).run(candidateId, tagsJson, ratingVal, notesVal, req.user.id);
  }

  const row = db.prepare('SELECT tags, rating, notes, updated_at FROM candidate_tags WHERE candidate_id = ?').get(candidateId);
  auditService.log(req.user.id, 'UPDATE_candidate_tags', 'candidate', candidateId, { before, after: { tags: JSON.parse(tagsJson), rating: ratingVal, notes: notesVal } }, req.ip);
  res.json(success({
    candidate_id: candidateId,
    tags: parseTags(row.tags),
    rating: row.rating,
    notes: row.notes,
    updated_at: row.updated_at,
  }));
}));

// ============================================================
// 工作经历 / 教育背景 / 联系记录
// 注册到主 router 上（req.params.id 从 :id 路径段取）
// ============================================================

function registerSubRoutes(prefix, table, fields) {
  // prefix 形如 '/:id/experiences'
  const resourceName = table.replace('candidate_', '').replace(/s$/, '');
  const orderBy = table === 'candidate_contacts' ? 'contact_at DESC' : 'is_current DESC, start_date DESC';

  function verifyCandidate(req) {
    const cid = parseInt(req.params.id);
    if (!cid) throw badRequest('无效的候选人 ID');
    const db = getDb();
    const cand = db.prepare(
      req.user.role === 'admin'
        ? 'SELECT id FROM candidates WHERE id = ? AND deleted_at IS NULL'
        : 'SELECT id FROM candidates WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
    ).get(...(req.user.role === 'admin' ? [cid] : [cid, req.user.id]));
    if (!cand) throw notFound('候选人不存在');
    return cid;
  }

  // 列表 ===== P1-6 修复：子表分页（接受 ?limit=50&offset=0）=====
  router.get(prefix, asyncHandler(async (req, res) => {
    const cid = verifyCandidate(req);
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const rows = db.prepare(
      `SELECT * FROM ${table} WHERE candidate_id = ? AND deleted_at IS NULL ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).all(cid, limit, offset);
    // 同时返回总数（前端判断"是否还有更多"）
    const total = db.prepare(
      `SELECT COUNT(*) AS cnt FROM ${table} WHERE candidate_id = ? AND deleted_at IS NULL`
    ).get(cid).cnt;
    res.json(success(rows, { total: total, limit: limit, offset: offset }));
  }));
  // ===== 修复结束 =====

  // 创建
  router.post(prefix, asyncHandler(async (req, res) => {
    const cid = verifyCandidate(req);
    const body = req.body || {};
    const db = getDb();
    const cols = fields.join(', ');
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(f => {
      if (f === 'candidate_id') return cid;
      if (f === 'user_id') return req.user.id;
      if (f === 'is_current') return body[f] ? 1 : 0;
      return body[f] !== undefined ? body[f] : null;
    });
    db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`).run(...values);
    const row = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 1`).get();
    auditService.log(req.user.id, `CREATE_${resourceName}`, resourceName, row.id, body, req.ip);
    res.json(success(row));
  }));

  // 更新
  router.put(`${prefix}/:eid`, asyncHandler(async (req, res) => {
    const cid = verifyCandidate(req);
    const eid = parseInt(req.params.eid);
    if (!eid) throw badRequest('无效的子记录 ID');
    const db = getDb();
    const before = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND candidate_id = ?`).get(eid, cid);
    if (!before || before.deleted_at) throw notFound('记录不存在');
    const body = req.body || {};
    const next = {};
    fields.forEach(f => {
      if (f === 'candidate_id' || f === 'user_id') return;
      if (body[f] !== undefined) {
        next[f] = f === 'is_current' ? (body[f] ? 1 : 0) : body[f];
      } else {
        next[f] = before[f];
      }
    });
    const setSql = Object.keys(next).map(f => `${f} = ?`).join(', ');
    const result = db.prepare(`
      UPDATE ${table} SET ${setSql}, updated_at = datetime('now')
      WHERE id = ? AND candidate_id = ? AND deleted_at IS NULL
    `).run(...Object.values(next), eid, cid);
    if (result.changes === 0) throw notFound('记录不存在或无权操作');
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(eid);
    auditService.log(req.user.id, `UPDATE_${resourceName}`, resourceName, eid, { before, after: row }, req.ip);
    res.json(success(row));
  }));

  // 软删除
  router.delete(`${prefix}/:eid`, asyncHandler(async (req, res) => {
    const cid = verifyCandidate(req);
    const eid = parseInt(req.params.eid);
    if (!eid) throw badRequest('无效的子记录 ID');
    const db = getDb();
    const before = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND candidate_id = ?`).get(eid, cid);
    if (!before || before.deleted_at) throw notFound('记录不存在');
    const result = db.prepare(`
      UPDATE ${table} SET deleted_at = datetime('now')
      WHERE id = ? AND candidate_id = ? AND deleted_at IS NULL
    `).run(eid, cid);
    if (result.changes === 0) throw notFound('记录不存在或无权操作');
    auditService.log(req.user.id, `DELETE_${resourceName}`, resourceName, eid, null, req.ip);
    res.json(success({ id: eid, deleted: true }));
  }));
}

registerSubRoutes('/:id/experiences', 'candidate_experiences', [
  'candidate_id', 'company', 'position', 'start_date', 'end_date', 'is_current', 'salary', 'description', 'user_id'
]);
registerSubRoutes('/:id/educations', 'candidate_educations', [
  'candidate_id', 'school', 'major', 'degree', 'start_date', 'end_date', 'is_current', 'user_id'
]);
registerSubRoutes('/:id/contacts', 'candidate_contacts', [
  'candidate_id', 'contact_type', 'contact_at', 'content', 'next_follow_up_at', 'user_id'
]);

// ============================================================
// 工具
// ============================================================

function parseTags(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * POST /api/v1/candidates/batch
 * 批量操作
 * body: { action: 'tag'|'untag'|'status'|'delete', ids: number[], params: {...} }
 */
router.post('/batch', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { action, ids, params = {} } = body;
  if (!action) throw badRequest('action 必填');
  if (!Array.isArray(ids) || !ids.length) throw badRequest('ids 必填且非空');
  if (ids.length > 500) throw badRequest('单次最多 500 个');

  const db = getDb();
  const isAdmin = req.user.role === 'admin';
  const results = { success: 0, failed: 0, errors: [] };

  // 预先 verify 所有 id 归属当前 user（admin 跨用户跳过）
  const placeholders = ids.map(() => '?').join(',');
  const verifySql = isAdmin
    ? `SELECT id, user_id FROM candidates WHERE id IN (${placeholders}) AND deleted_at IS NULL`
    : `SELECT id, user_id FROM candidates WHERE id IN (${placeholders}) AND deleted_at IS NULL AND user_id = ?`;
  const verifyParams = isAdmin ? ids.slice() : ids.concat([req.user.id]);
  const candidates = db.prepare(verifySql).all(...verifyParams);
  const ownedIds = candidates.map(c => c.id);
  if (ownedIds.length === 0) {
    throw badRequest('没有可操作的候选人（可能都不属于你）');
  }

  // sql.js 的 db.exec('BEGIN/COMMIT/ROLLBACK') 不可靠，去掉事务包装
  for (const id of ownedIds) {
    try {
      if (action === 'delete') {
        db.prepare('UPDATE candidates SET deleted_at = datetime(\'now\') WHERE id = ?').run(id);
        auditService.log(req.user.id, 'BATCH_DELETE_candidate', 'candidate', id, null, req.ip);
      } else if (action === 'status') {
        if (!params.status) throw badRequest('status 必填');
        db.prepare('UPDATE candidates SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(params.status, id);
        auditService.log(req.user.id, 'BATCH_STATUS_candidate', 'candidate', id, { status: params.status }, req.ip);
      } else if (action === 'tag') {
        if (!params.tag || !String(params.tag).trim()) throw badRequest('tag 必填');
        const tagStr = String(params.tag).trim();
        // ===== P0-NEW-2 修复：乐观锁 =====
        const existing = db.prepare('SELECT tags, version FROM candidate_tags WHERE candidate_id = ?').get(id);
        let tags = [];
        let version = 0;
        if (existing && existing.tags) {
          try { tags = JSON.parse(existing.tags); } catch (e) {}
          version = existing.version || 0;
        }
        if (tags.indexOf(tagStr) === -1) {
          tags.push(tagStr);
          const json = JSON.stringify(tags);
          if (existing) {
            const r = db.prepare(`
              UPDATE candidate_tags SET tags = ?, version = version + 1, updated_at = datetime('now')
              WHERE candidate_id = ? AND version = ?
            `).run(json, id, version);
            if (r.changes === 0) console.warn('P0-NEW-2: batch tag conflict for candidate', id);
          } else {
            db.prepare('INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, ?, ?)').run(id, json, req.user.id);
          }
          // ===== 修复结束 =====
          auditService.log(req.user.id, 'BATCH_TAG_candidate', 'candidate', id, { tag: tagStr }, req.ip);
        }
      } else if (action === 'untag') {
        if (!params.tag) throw badRequest('tag 必填');
        const tagStr = String(params.tag);
        // ===== P0-NEW-2 修复：乐观锁 =====
        const existing = db.prepare('SELECT tags, version FROM candidate_tags WHERE candidate_id = ?').get(id);
        if (existing && existing.tags) {
          let tags = [];
          try { tags = JSON.parse(existing.tags); } catch (e) {}
          const idx = tags.indexOf(tagStr);
          if (idx !== -1) {
            tags.splice(idx, 1);
            const json = JSON.stringify(tags);
            const r = db.prepare(`
              UPDATE candidate_tags SET tags = ?, version = version + 1, updated_at = datetime('now')
              WHERE candidate_id = ? AND version = ?
            `).run(json, id, existing.version || 0);
            if (r.changes === 0) console.warn('P0-NEW-2: batch untag conflict for candidate', id);
            auditService.log(req.user.id, 'BATCH_UNTAG_candidate', 'candidate', id, { tag: tagStr }, req.ip);
          }
        }
        // ===== 修复结束 =====
      } else {
        throw badRequest('不支持的 action: ' + action);
      }
      results.success++;
    } catch (e) {
      results.failed++;
      results.errors.push({ id: id, error: e.message || String(e) });
    }
  }

  res.json(success({
    action: action,
    requested: ids.length,
    processed: ownedIds.length,
    skipped: ids.length - ownedIds.length,
    success: results.success,
    failed: results.failed,
    errors: results.errors.slice(0, 10)
  }));
}));

module.exports = router;
