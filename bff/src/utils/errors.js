const ErrorCodes = {
  NO_TOKEN: { code: 'NO_TOKEN', status: 401, message: '未登录' },
  INVALID_TOKEN: { code: 'INVALID_TOKEN', status: 401, message: '登录已过期，请重新登录' },
  UNAUTHORIZED: { code: 'UNAUTHORIZED', status: 401, message: '认证失败' },
  FORBIDDEN: { code: 'FORBIDDEN', status: 403, message: '无权访问' },
  NOT_FOUND: { code: 'NOT_FOUND', status: 404, message: '资源不存在' },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 400, message: '参数校验失败' },
  DUPLICATE: { code: 'DUPLICATE', status: 409, message: '记录已存在' },
  CONFLICT: { code: 'CONFLICT', status: 409, message: '操作冲突' },
  RATE_LIMITED: { code: 'RATE_LIMITED', status: 429, message: '请求过于频繁' },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500, message: '服务器内部错误' },
};

class ApiError extends Error {
  constructor(code, message, details, statusCode) {
    const def = ErrorCodes[code] || ErrorCodes.INTERNAL_ERROR;
    super(message || def.message);
    this.name = 'ApiError';
    this.code = def.code;
    this.statusCode = statusCode || def.status;
    if (details !== undefined) this.details = details;
  }
}

function notFound(message) { return new ApiError('NOT_FOUND', message); }
function badRequest(message, details) { return new ApiError('VALIDATION_ERROR', message, details); }
function unauthorized(message) { return new ApiError('UNAUTHORIZED', message); }
function forbidden(message) { return new ApiError('FORBIDDEN', message); }
function conflict(message) { return new ApiError('CONFLICT', message); }
function duplicate(message) { return new ApiError('DUPLICATE', message); }
function rateLimited(message) { return new ApiError('RATE_LIMITED', message); }
function internal(message) { return new ApiError('INTERNAL_ERROR', message); }

module.exports = {
  ErrorCodes,
  ApiError,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  duplicate,
  rateLimited,
  internal,
};
