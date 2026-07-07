// bff/src/middleware/auth.js
// v9.0-gamma: requireAuth 支持两种鉴权方式
//   - JWT: Authorization: Bearer <jwt>  (人类用户)
//   - API Key: Authorization: ApiKey <key>  (AI agent / 兄弟项目 / 自建客户端)
// 任一通过即挂 req.user；后续可加 requireScope(...scopes) 中间件做细粒度授权。

const { verifyToken, findUserById } = require('../services/authService');
const { ApiError } = require('../utils/errors');
const apiKeyMw = require('./apiKey');

function extractBearer(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

function requireApiKeyFromHeader(req) {
  return apiKeyMw.extractApiKey(req);
}

function applyApiKeyAuth(req, next) {
  const key = requireApiKeyFromHeader(req);
  if (!key) return next(new ApiError('NO_TOKEN', '需要 Bearer JWT 或 ApiKey'));
  const row = apiKeyMw.findApiKey(key);
  if (!row) return next(new ApiError('INVALID_TOKEN', 'ApiKey 无效或已撤销'));
  let scopes = [];
  try {
    scopes = JSON.parse(row.scopes || '[]');
  } catch (e) {
    scopes = [];
  }
  apiKeyMw.touchLastUsed?.(row.id); // optional, undefined-safe
  req.user = {
    id: row.user_id || 0,
    username: `service:${row.client_name}`,
    role: 'service',
    displayName: `API Key (${row.client_name})`,
    clientName: row.client_name,
    scopes,
    apiKeyId: row.id,
    authMethod: 'apiKey',
  };
  req.token = key.slice(0, 8) + '...';
  next();
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h) {
    return next(new ApiError('NO_TOKEN', '需要 Bearer JWT 或 ApiKey Authorization'));
  }
  const isApiKey = /^ApiKey\s+/i.test(h);
  const isBearer = /^Bearer\s+/i.test(h);

  if (isApiKey) {
    return applyApiKeyAuth(req, next);
  }

  if (!isBearer) {
    return next(new ApiError('NO_TOKEN', 'Authorization 必须以 Bearer 或 ApiKey 开头'));
  }

  // ===== 原有 JWT 流程（不变）=====
  const token = extractBearer(req);
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
      authMethod: 'jwt',
    };
    req.token = token;
    next();
  }).catch(next);
}

function requireAuthOptional(req, res, next) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h) return next();
  // 也支持 ApiKey (v9.0-gamma)
  if (/^ApiKey\s+/i.test(h)) {
    return applyApiKeyAuth(req, () => next()); // 失败不报错，继续
  }
  const token = extractBearer(req);
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
          authMethod: 'jwt',
        };
        req.token = token;
      }
      next();
    }).catch(() => next());
  } catch (err) {
    next();
  }
}

module.exports = { requireAuth, requireAuthOptional, extractBearer };
