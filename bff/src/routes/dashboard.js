const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { getDb } = require('../db/init');
const asyncHandler = require('../utils/asyncHandler');
const platformApi = require('../services/platformApi');

const router = express.Router();
router.use(requireAuth);

router.get('/stats', asyncHandler(async (req, res) => {
  const db = getDb();
  const isAdmin = req.user.role === 'admin';
  const recent = 5;

  const baseWhere = isAdmin ? 'deleted_at IS NULL' : 'deleted_at IS NULL AND user_id = ?';
  const baseParams = isAdmin ? [] : [req.user.id];

  const interviewsCount = db.prepare(
    `SELECT COUNT(*) as total FROM interviews WHERE ${baseWhere}`
  ).get(...baseParams).total;

  const pendingTasks = db.prepare(
    `SELECT COUNT(*) as total FROM tasks WHERE ${baseWhere} AND status = ?`
  ).get(...baseParams, 'pending').total;

  const completedTasks = db.prepare(
    `SELECT COUNT(*) as total FROM tasks WHERE ${baseWhere} AND status = ?`
  ).get(...baseParams, 'completed').total;

  const recentInterviews = db.prepare(
    `SELECT * FROM interviews WHERE ${baseWhere} ORDER BY scheduled_at DESC LIMIT ?`
  ).all(...baseParams, recent);

  const recentTasks = db.prepare(
    `SELECT * FROM tasks WHERE ${baseWhere} ORDER BY created_at DESC LIMIT ?`
  ).all(...baseParams, recent);

  let platformStats = null;
  let platformAvailable = false;
  try {
    const result = await platformApi.dashboard.getStats();
    if (result && result.ok) {
      platformStats = result.data;
      platformAvailable = true;
    }
  } catch (e) {
    platformAvailable = false;
  }

  const baseData = {
    interviews_count: interviewsCount,
    pending_tasks: pendingTasks,
    completed_tasks: completedTasks,
    recent_interviews: recentInterviews,
    recent_tasks: recentTasks,
  };

  if (platformAvailable && platformStats) {
    res.json(success({ ...platformStats, ...baseData }));
  } else {
    res.json(success({
      total_candidates: 0,
      total_jobs: 0,
      total_clients: 0,
      active_recommendations: 0,
      platform_available: false,
      ...baseData,
    }));
  }
}));

module.exports = router;