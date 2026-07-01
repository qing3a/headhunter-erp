const { ApiError, ErrorCodes } = require('../utils/errors');
const { fail } = require('../utils/response');

function notFoundHandler(req, res, next) {
  res.status(404).json(fail('NOT_FOUND', `路径不存在: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      console.error('[API 5xx]', err);
    }
    return res.status(err.statusCode).json(fail(err.code, err.message, err.details));
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json(fail('VALIDATION_ERROR', '请求体 JSON 格式错误'));
  }
  console.error('[Unhandled]', err);
  // ===== P2-A2 修复：prod 模式不暴露内部错误详情（仅 dev 透出）=====
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json(fail('INTERNAL_ERROR', isDev ? (err.message || '服务器内部错误') : '服务异常，请稍后重试'));
  // ===== 修复结束 =====
}

module.exports = { notFoundHandler, errorHandler };
