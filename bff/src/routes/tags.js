const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { success, pagination } = require('../utils/response');
const { badRequest, notFound, conflict } = require('../utils/errors');
const auditService = require('../services/auditService');
const asyncHandler = require('../utils/asyncHandler');
const { getDb } = require('../db/init');

const router = express.Router();
router.use(requireAuth);

// ===== P2-C4 修复：tags 写入串行化 mutex，防止并发覆盖 =====
// tag rename/merge/delete 都是"读 JSON → 改 → 写 JSON"模式，并发会丢数据
// 用全局 promise 链串行化（sql.js 单进程，够用）
let tagsWriteQueue = Promise.resolve();
function withTagsLock(fn) {
  // 返回 Express 中间件：调用 fn(req, res)，完成后调用 next()
  return function (req, res, next) {
    const run = tagsWriteQueue.then(function () { return fn(req, res); });
    tagsWriteQueue = run.catch(function () {});
    run.then(function () {
      // 仅在 res 未结束时 next（避免重复响应）
      if (!res.headersSent) next();
    }).catch(next);
  };
}

function loadAllTags(db, userId, isAdmin) {
  const rows = isAdmin
    ? db.prepare('SELECT candidate_id, tags FROM candidate_tags WHERE deleted_at IS NULL').all()
    : db.prepare('SELECT candidate_id, tags FROM candidate_tags ct WHERE ct.deleted_at IS NULL AND ct.user_id = ?').all(userId);
  const map = {};
  rows.forEach(function (r) {
    let tags = [];
    try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
    tags.forEach(function (t) {
      if (!map[t]) map[t] = { name: t, count: 0, candidate_ids: [] };
      map[t].count++;
      map[t].candidate_ids.push(r.candidate_id);
    });
  });
  return Object.values(map).sort(function (a, b) { return b.count - a.count; });
}

router.get('/', asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { keyword } = req.query;
  let tags = loadAllTags(getDb(), req.user.id, isAdmin);
  if (keyword) tags = tags.filter(function (t) { return t.name.indexOf(keyword) !== -1; });
  res.json(success(tags));
}));

// ===== P1-NEW-8 修复：tag 精确匹配（instr 找 JSON 字符串里的引号包围 tag）=====
// JSON 数组里 tag 必然前后是双引号：["tag1","tag2"] 找 "tag1" → instr 命中
// 避免 LIKE '%"tag"%' 误匹配 "tag1前后" / "tag2X" 等子串
router.get('/:name/candidates', asyncHandler(async (req, res) => {
  const tagName = decodeURIComponent(req.params.name);
  const isAdmin = req.user.role === 'admin';
  const db = getDb();
  const where = isAdmin
    ? "ct.deleted_at IS NULL AND instr(ct.tags, ?) > 0"
    : "ct.deleted_at IS NULL AND ct.user_id = ? AND instr(ct.tags, ?) > 0";
  const params = isAdmin ? ['"' + tagName + '"'] : [req.user.id, '"' + tagName + '"'];
  const rows = db.prepare(
    `SELECT c.id, c.name, c.current_position, c.current_company, c.status, c.current_city
     FROM candidates c
     JOIN candidate_tags ct ON ct.candidate_id = c.id
     WHERE c.deleted_at IS NULL AND ${where}
     ORDER BY c.updated_at DESC LIMIT 200`
  ).all(...params);
  res.json(success(rows));
}));

router.put('/:tag/rename', withTagsLock(async (req, res) => {
  const oldName = decodeURIComponent(req.params.tag);
  const { new_name } = req.body || {};
  if (!new_name || !String(new_name).trim()) throw badRequest('new_name 必填');
  const newName = String(new_name).trim();
  if (newName === oldName) throw badRequest('新旧名相同');
  const isAdmin = req.user.role === 'admin';
  const db = getDb();
  const where = isAdmin
    ? 'deleted_at IS NULL AND instr(tags, ?) > 0'
    : 'deleted_at IS NULL AND user_id = ? AND instr(tags, ?) > 0';
  const params = isAdmin ? ['"' + oldName + '"'] : [req.user.id, '"' + oldName + '"'];
  // ===== P0-NEW-2 修复：SELECT 读 version 字段 =====
  const rows = db.prepare('SELECT candidate_id, tags, version FROM candidate_tags WHERE ' + where).all(...params);
  let changed = 0;
  rows.forEach(function (r) {
    let tags = [];
    try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
    const idx = tags.indexOf(oldName);
    if (idx !== -1) {
      tags[idx] = newName;
      tags = Array.from(new Set(tags));
      // ===== P0-NEW-2 修复：乐观锁，UPDATE WHERE version = ? =====
      const result = db.prepare(`
        UPDATE candidate_tags SET tags = ?, version = version + 1, updated_at = datetime('now')
        WHERE candidate_id = ? AND version = ?
      `).run(JSON.stringify(tags), r.candidate_id, r.version || 0);
      if (result.changes === 0) {
        // 静默跳过，标记冲突（不影响主流程）
        console.warn('P0-NEW-2: rename conflict for candidate', r.candidate_id);
      } else {
        changed++;
      }
      // ===== 修复结束 =====
    }
  });
  auditService.log(req.user.id, 'RENAME_tag', 'tag', null, { from: oldName, to: newName, count: changed }, req.ip);
  res.json(success({ from: oldName, to: newName, updated: changed }));
}));

router.delete('/:tag', withTagsLock(async (req, res) => {
  const tagName = decodeURIComponent(req.params.tag);
  const isAdmin = req.user.role === 'admin';
  const db = getDb();
  const where = isAdmin
    ? 'deleted_at IS NULL AND instr(tags, ?) > 0'
    : 'deleted_at IS NULL AND user_id = ? AND instr(tags, ?) > 0';
  const params = isAdmin ? ['"' + tagName + '"'] : [req.user.id, '"' + tagName + '"'];
  // ===== P0-NEW-2 修复：SELECT 读 version 字段 =====
  const rows = db.prepare('SELECT candidate_id, tags, version FROM candidate_tags WHERE ' + where).all(...params);
  let removed = 0;
  rows.forEach(function (r) {
    let tags = [];
    try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
    const idx = tags.indexOf(tagName);
    if (idx !== -1) {
      tags.splice(idx, 1);
      const json = JSON.stringify(tags);
      if (tags.length === 0) {
        // 没 tag 了，整行删除（不影响 version 链，主键行不存在）
        db.prepare('DELETE FROM candidate_tags WHERE candidate_id = ?').run(r.candidate_id);
        removed++;
      } else {
        // ===== P0-NEW-2 修复：乐观锁 =====
        const result = db.prepare(`
          UPDATE candidate_tags SET tags = ?, version = version + 1, updated_at = datetime('now')
          WHERE candidate_id = ? AND version = ?
        `).run(json, r.candidate_id, r.version || 0);
        if (result.changes === 0) {
          console.warn('P0-NEW-2: delete-tag conflict for candidate', r.candidate_id);
        } else {
          removed++;
        }
        // ===== 修复结束 =====
      }
    }
  });
  auditService.log(req.user.id, 'DELETE_tag', 'tag', null, { tag: tagName, count: removed }, req.ip);
  res.json(success({ tag: tagName, removed: removed }));
}));

router.post('/merge', withTagsLock(async (req, res) => {
  const { from, to } = req.body || {};
  if (!Array.isArray(from) || from.length === 0) throw badRequest('from 必填且非空数组');
  if (!to || !String(to).trim()) throw badRequest('to 必填');
  const target = String(to).trim();
  const isAdmin = req.user.role === 'admin';
  const db = getDb();
  const allFroms = from.map(function (s) { return String(s).trim(); }).filter(Boolean);
  const base = allFroms[0];
  let totalUpdated = 0;
  for (let i = 1; i < allFroms.length; i++) {
    const oldName = allFroms[i];
    const like = '"' + oldName + '"';
    const where = isAdmin ? 'deleted_at IS NULL AND instr(tags, ?) > 0' : 'deleted_at IS NULL AND user_id = ? AND instr(tags, ?) > 0';
    const params = isAdmin ? [like] : [req.user.id, like];
    // ===== P0-NEW-2 修复：SELECT 读 version 字段 =====
    const rows = db.prepare('SELECT candidate_id, tags, version FROM candidate_tags WHERE ' + where).all(...params);
    rows.forEach(function (r) {
      let tags = [];
      try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
      const idx = tags.indexOf(oldName);
      if (idx !== -1) {
        tags[idx] = base;
        tags = Array.from(new Set(tags));
        // ===== P0-NEW-2 修复：乐观锁 =====
        const result = db.prepare(`
          UPDATE candidate_tags SET tags = ?, version = version + 1, updated_at = datetime('now')
          WHERE candidate_id = ? AND version = ?
        `).run(JSON.stringify(tags), r.candidate_id, r.version || 0);
        if (result.changes === 0) {
          console.warn('P0-NEW-2: merge-phase1 conflict for candidate', r.candidate_id);
        } else {
          totalUpdated++;
        }
        // ===== 修复结束 =====
      }
    });
  }
  const like2 = '"' + base + '"';
  const where2 = isAdmin ? 'deleted_at IS NULL AND instr(tags, ?) > 0' : 'deleted_at IS NULL AND user_id = ? AND instr(tags, ?) > 0';
  const params2 = isAdmin ? [like2] : [req.user.id, like2];
  // ===== P0-NEW-2 修复：SELECT 读 version 字段 =====
  const rows2 = db.prepare('SELECT candidate_id, tags, version FROM candidate_tags WHERE ' + where2).all(...params2);
  rows2.forEach(function (r) {
    let tags = [];
    try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
    const idx = tags.indexOf(base);
    if (idx !== -1) {
      tags[idx] = target;
      tags = Array.from(new Set(tags));
      // ===== P0-NEW-2 修复：乐观锁 =====
      const result = db.prepare(`
        UPDATE candidate_tags SET tags = ?, version = version + 1, updated_at = datetime('now')
        WHERE candidate_id = ? AND version = ?
      `).run(JSON.stringify(tags), r.candidate_id, r.version || 0);
      if (result.changes === 0) {
        console.warn('P0-NEW-2: merge-phase2 conflict for candidate', r.candidate_id);
      } else {
        totalUpdated++;
      }
      // ===== 修复结束 =====
    }
  });
  auditService.log(req.user.id, 'MERGE_tags', 'tag', null, { from: allFroms, to: target, count: totalUpdated }, req.ip);
  res.json(success({ from: allFroms, to: target, updated: totalUpdated }));
}));

module.exports = router;
