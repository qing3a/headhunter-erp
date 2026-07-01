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

module.exports = { requireRole, requireAdmin };
