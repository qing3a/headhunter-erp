const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const authService = require('../services/authService');
const auditService = require('../services/auditService');
const { requireAuth, requireAuthOptional } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permission');
const { success, pagination } = require('../utils/response');
const { badRequest, notFound, conflict } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');
const { getDb } = require('../db/init');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: '登录尝试过于频繁，请稍后再试' } },
});

function getIp(req) {
  // ===== P2-B3 修复：trust proxy=1 已让 Express 自动从 X-Forwarded-For 取 client IP =====
  // 直接用 req.ip，避免手动解析 header 被攻击者伪造
  return (req.ip || req.connection?.remoteAddress || '').toString();
}

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    throw badRequest('用户名和密码必填');
  }
  const result = await authService.login(username, password);
  auditService.log(result.user.id, 'LOGIN', 'user', result.user.id, { ip: getIp(req) }, getIp(req));
  res.json(success(result));
}));

router.post('/logout', requireAuth, (req, res) => {
  auditService.log(req.user.id, 'LOGOUT', 'user', req.user.id, null, getIp(req));
  res.json(success({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  res.json(success({
    id: req.user.id,
    username: req.user.username,
    displayName: req.user.displayName,
    role: req.user.role,
  }));
});

router.post('/register', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { username, password, displayName, role } = req.body || {};
  const user = await authService.createUser({ username, password, displayName, role });
  auditService.log(req.user.id, 'CREATE_USER', 'user', user.id, { username, role: user.role }, getIp(req));
  res.json(success(user));
}));

router.get('/users', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 200);
  const all = await authService.listUsers();
  const total = all.length;
  const data = all.slice((page - 1) * pageSize, page * pageSize);
  res.json(pagination(data, total, page, pageSize));
}));

// v1.1: 用户详情（自己或 admin）
router.get('/users/:id', requireAuth, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    throw badRequest('无权查看其他用户');
  }
  const u = await authService.findUserById(userId);
  if (!u) throw notFound('用户不存在');
  res.json(success({
    id: u.id, username: u.username, displayName: u.display_name, role: u.role
  }));
}));

// v1.1: 修改自己的 displayName（admin 可改任意用户的）
router.put('/users/:id', requireAuth, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    throw badRequest('无权修改其他用户');
  }
  const { displayName } = req.body || {};
  const u = await authService.findUserById(userId);
  if (!u) throw notFound('用户不存在');

  if (displayName === undefined) return res.json(success({ id: userId, message: '无变更' }));

  const db = getDb();
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(String(displayName).trim() || u.username, userId);
  auditService.log(req.user.id, 'UPDATE_USER', 'user', userId, { displayName }, getIp(req));
  res.json(success({ id: userId, message: '已更新' }));
}));

// v1.1: 修改密码（必须提供旧密码）
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) throw badRequest('原密码和新密码必填');
  if (new_password.length < 6) throw badRequest('新密码至少 6 位');

  const db = getDb();
  const u = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!u) throw notFound('用户不存在');

  const ok = await bcrypt.compare(old_password, u.password_hash);
  if (!ok) throw badRequest('原密码错误');

  const newHash = await bcrypt.hash(new_password, 10);
  // ===== P0-3 修复：改密同时更新 tokens_invalidated_after，撤销所有旧 token =====
  // ===== P3-3 修复：同时更新 last_login_at（改密后用户重新登录）=====
  db.prepare("UPDATE users SET password_hash = ?, tokens_invalidated_after = datetime('now'), last_login_at = datetime('now') WHERE id = ?").run(newHash, req.user.id);
  // ===== 修复结束 =====
  auditService.log(req.user.id, 'CHANGE_PASSWORD', 'user', req.user.id, null, getIp(req));
  res.json(success({ id: req.user.id, message: '密码已更新' }));
}));

router.get('/audit-log', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId) : undefined;
    const action = req.query.action;
    const page = parseInt(req.query.page) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 200);
    const result = auditService.list({ userId, action, page, pageSize });
    res.json(pagination(result.rows, result.total, result.page, result.pageSize));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
