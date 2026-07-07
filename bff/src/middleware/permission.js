const { ApiError } = require('../utils/errors');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError('UNAUTHORIZED', '未登录'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError('FORBIDDEN', '当前角色无权操作'));
    }
    next();
  };
}

const requireAdmin = requireRole('admin');

// ===== v9.0-gamma 新增：API Key scope 校验 =====
// 配套 requireAuth (smart-detect) — 当 req.user.authMethod === 'apiKey' 时校验 scopes
// JWT 用户 (role: admin/consultant) 跳过 scope 检查
function requireScope(...requiredScopes) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError('UNAUTHORIZED', '未登录'));
    if (req.user.authMethod !== 'apiKey') {
      // JWT 用户不受 scope 限制 (由 role 控制)
      return next();
    }
    const scopes = Array.isArray(req.user.scopes) ? req.user.scopes : [];
    const hasAll = requiredScopes.every(s => scopes.includes(s) || scopes.includes('*'));
    if (!hasAll) {
      return next(new ApiError('FORBIDDEN', `ApiKey 缺少 scope: ${requiredScopes.join(', ')}`));
    }
    next();
  };
}

module.exports = { requireRole, requireAdmin, requireScope };
