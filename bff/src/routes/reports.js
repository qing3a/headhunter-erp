const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { badRequest } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');
const { getDb } = require('../db/init');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/v1/reports/kpi
 * 4 个 KPI 卡片
 *  - totalCandidates: 总候选人（未软删）
 *  - monthlyRecommendations: 本月推荐数
 *  - activeInterviews: 面试中数量
 *  - monthlyHires: 本月入职数
 */
router.get('/kpi', asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const db = getDb();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartStr = monthStart.toISOString().slice(0, 19).replace('T', ' ');

  const candWhere = isAdmin ? 'deleted_at IS NULL' : 'deleted_at IS NULL AND user_id = ?';
  const candParams = isAdmin ? [] : [req.user.id];
  const totalCandidates = db.prepare('SELECT COUNT(*) AS cnt FROM candidates WHERE ' + candWhere).get(...candParams).cnt;

  const recWhere = isAdmin ? 'deleted_at IS NULL' : 'deleted_at IS NULL AND recommend_user_id = ?';
  const recParams = isAdmin ? [] : [req.user.id];
  const monthlyRecs = db.prepare('SELECT COUNT(*) AS cnt FROM recommendations WHERE ' + recWhere + ' AND recommend_at >= ?')
    .get(...recParams, monthStartStr).cnt;
  const monthlyHires = db.prepare('SELECT COUNT(*) AS cnt FROM recommendations WHERE ' + recWhere + " AND status = 'hired' AND last_status_change_at >= ?")
    .get(...recParams, monthStartStr).cnt;

  const intWhere = isAdmin ? 'deleted_at IS NULL' : 'deleted_at IS NULL AND user_id = ?';
  const intParams = isAdmin ? [] : [req.user.id];
  const activeInterviews = db.prepare("SELECT COUNT(*) AS cnt FROM interviews WHERE " + intWhere + " AND status = 'scheduled'")
    .get(...intParams).cnt;

  res.json(success({
    totalCandidates: totalCandidates,
    monthlyRecommendations: monthlyRecs,
    activeInterviews: activeInterviews,
    monthlyHires: monthlyHires
  }));
}));

/**
 * GET /api/v1/reports/funnel
 * 招聘漏斗：推荐 → 面试 → offer → 入职
 * Query: days（默认 30）
 */
router.get('/funnel', asyncHandler(async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days) || 30);
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const isAdmin = req.user.role === 'admin';
  const db = getDb();
  // ===== P1-NEW-1 修复：参数化 SQL，避免字符串拼接 =====
  const userWhere = isAdmin ? '1=1' : 'recommend_user_id = ?';
  const userParams = isAdmin ? [] : [req.user.id];
  // ===== 修复结束 =====

  // 各状态计数（在 N 天内有 recommend_at 或 last_status_change_at 的推荐）
  const stages = [
    { key: 'recommended', label: '已推荐' },
    { key: 'interviewing', label: '面试中' },
    { key: 'offered', label: '已发 offer' },
    { key: 'hired', label: '已入职' }
  ];
  const data = stages.map(function (s) {
    const cnt = db.prepare(
      'SELECT COUNT(*) AS cnt FROM recommendations WHERE ' + userWhere + ' AND status = ? AND (recommend_at >= ? OR last_status_change_at >= ?)'
    ).get(...userParams, s.key, since, since).cnt;
    return { key: s.key, label: s.label, count: cnt };
  });

  res.json(success({ days: days, stages: data }));
}));

/**
 * GET /api/v1/reports/consultant-performance
 * 顾问 Top（按 recommend / hired 数）—— admin 看全部，consultant 看自己
 * Query: days（默认 30）
 */
router.get('/consultant-performance', asyncHandler(async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days) || 30);
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const isAdmin = req.user.role === 'admin';
  const db = getDb();

  // 只 admin 能看所有人的；consultant 只能看自己
  // ===== P1-NEW-1 修复：参数化 =====
  const where = isAdmin ? '1=1' : 'recommend_user_id = ?';
  const whereParams = isAdmin ? [] : [req.user.id];
  const rows = db.prepare(
    `SELECT recommend_user_id AS user_id, recommend_username AS username,
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'interviewing' THEN 1 ELSE 0 END) AS interviewing,
            SUM(CASE WHEN status = 'hired' THEN 1 ELSE 0 END) AS hired
     FROM recommendations
     WHERE ${where} AND recommend_at >= ?
     GROUP BY recommend_user_id, recommend_username
     ORDER BY total DESC LIMIT 10`
  ).all(...whereParams, since);
  // ===== 修复结束 =====

  res.json(success({ days: days, consultants: rows }));
}));

/**
 * GET /api/v1/reports/status-distribution
 * 候选人状态分布
 */
router.get('/status-distribution', asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const db = getDb();
  const where = isAdmin ? 'deleted_at IS NULL' : 'deleted_at IS NULL AND user_id = ?';
  const params = isAdmin ? [] : [req.user.id];
  const rows = db.prepare(
    `SELECT status, COUNT(*) AS cnt FROM candidates WHERE ${where} GROUP BY status ORDER BY cnt DESC`
  ).all(...params);
  res.json(success(rows));
}));

module.exports = router;
