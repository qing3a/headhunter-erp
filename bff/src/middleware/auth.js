const { verifyToken, findUserById } = require('../services/authService');
const { ApiError } = require('../utils/errors');

function extractToken(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next(new ApiError('NO_TOKEN', '未登录'));
  }
  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return next(new ApiError('INVALID_TOKEN', '登录已过期，请重新登录'));
  }
  findUserById(payload.id).then(user => {
    if (!user) return next(new ApiError('INVALID_TOKEN', '用户不存在'));
    if (user.status && user.status !== 'active') {
      return next(new ApiError('FORBIDDEN', '账号已停用'));
    }
    // ===== P0-3 修复：改密后撤销 token =====
// 如果用户表的 tokens_invalidated_after 存在且 >= 本 token 的签发时间 (iat)，则拒绝该 token。
// 注意：
// 1) SQLite 的 datetime('now') 返回 UTC（"YYYY-MM-DD HH:MM:SS"），new Date() 默认按本地时区解析，
//    必须追加 'Z' 显式声明为 UTC。
// 2) 用 `<=` 而非 `<`：SQLite 只精确到秒，change-password 经常与 token 签发落在同一秒。
//    用 `<` 会留下 1 秒安全漏洞（攻击者改密后立刻用同秒旧 token 调 API）。
//    用 `<=` 能保证改密后所有"之前或同时"签发的 token 都被撤销。
//    change-password 请求本身在 UPDATE 之前已通过校验，所以 token_A 在改密当次仍然有效，
//    改密完成后下一次用 token_A 调 API 就会被拒。
if (user.tokens_invalidated_after) {
  const ts = String(user.tokens_invalidated_after).replace(' ', 'T') + 'Z';
  const invalidAtSec = Math.floor(new Date(ts).getTime() / 1000);
  const tokenIat = payload.iat || Math.floor(Date.now() / 1000);
  if (tokenIat <= invalidAtSec) {
    return next(new ApiError('INVALID_TOKEN', 'token 已被撤销（请重新登录）'));
  }
}
// ===== 修复结束 =====
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
    };
    req.token = token;
    next();
  }).catch(next);
}

function requireAuthOptional(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    findUserById(payload.id).then(user => {
      if (user && user.status === 'active') {
        req.user = {
          id: user.id,
          username: user.username,
          role: user.role,
          displayName: user.display_name,
        };
        req.token = token;
      }
      next();
    }).catch(() => next());
  } catch (err) {
    next();
  }
}

module.exports = { requireAuth, requireAuthOptional, extractToken };
