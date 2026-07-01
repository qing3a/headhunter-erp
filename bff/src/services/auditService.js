const { getDb } = require('../db/init');

function writeLog(userId, action, resourceType, resourceId, detail, ip) {
  try {
    const db = getDb();
    const detailStr = detail === undefined || detail === null
      ? null
      : (typeof detail === 'string' ? detail : JSON.stringify(detail));
    db.prepare(`
      INSERT INTO audit_log (user_id, action, resource_type, resource_id, detail, ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId || null, action, resourceType || null,
           resourceId === undefined || resourceId === null ? null : String(resourceId),
           detailStr, ip || null);
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}

function log(userId, action, resourceType, resourceId, detail, ip) {
  setImmediate(() => writeLog(userId, action, resourceType, resourceId, detail, ip));
}

function list({ userId, action, page, pageSize } = {}) {
  const db = getDb();
  const p = parseInt(page) || 1;
  const ps = Math.min(parseInt(pageSize) || 50, 200);
  const where = [];
  const params = [];
  if (userId) { where.push('user_id = ?'); params.push(userId); }
  if (action) { where.push('action = ?'); params.push(action); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM audit_log ${whereSql}`).get(...params).cnt;
  const offset = (p - 1) * ps;
  const rows = db.prepare(`
    SELECT a.*, u.username, u.display_name
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ${whereSql}
    ORDER BY a.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, ps, offset);
  return { rows, total, page: p, pageSize: ps };
}

// ===== P0-4 修复：审计日志自动清理 =====
// 删除 N 天前的 audit_log 记录，防止表无限增长。
function cleanupOldAudit(daysOld) {
  const db = getDb();
  const days = parseInt(daysOld);
  if (!days || days < 1) return 0;
  const result = db.prepare(
    "DELETE FROM audit_log WHERE created_at < datetime('now', ?)"
  ).run('-' + days + ' days');
  return result.changes || 0;
}
// ===== 修复结束 =====

module.exports = { log, list, writeLog, cleanupOldAudit };
