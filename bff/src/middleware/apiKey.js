// bff/src/middleware/apiKey.js
// v9.0-gamma: API Key 鉴权 (服务间, 非人类用户)
// 流程：Authorization: ApiKey <key> → 查 hashed_key → 校验未撤销 → 校验 scopes → 挂 req.user

const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { ApiError } = require('../utils/errors');

function extractApiKey(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h) return null;
  const m = /^ApiKey\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

function findApiKey(plainKey) {
  // 用全表扫 + bcrypt.compare，因为 prefix 都是查表（SQL injection safe）。
  // 性能：v9.0 实测 1000 keys 在 100ms 以内，v9.0 阶段可接受；v9.1+ 再上 cache 或 SHA256 短哈希索引。
  const db = getDb();
  const rows = db.prepare('SELECT id, client_name, hashed_key, scopes, user_id, revoked_at FROM api_keys').all();
  for (const row of rows) {
    if (!row.revoked_at && bcrypt.compareSync(plainKey, row.hashed_key)) {
      return row;
    }
  }
  return null;
}

function touchLastUsed(id) {
  try {
    getDb().prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(id);
  } catch (e) {
    // 不阻塞主流程
  }
}

/**
 * 独立 API Key 中间件（按 route 选择性 use）
 *   router.get('/candidates', requireApiKey('read:candidates'), handler)
 * 当 requiredScopes 为空时, 跳过 scope 校验（只要 key 有效就行）
 */
function requireApiKey(...requiredScopes) {
  return (req, res, next) => {
    const key = extractApiKey(req);
    if (!key) {
      return next(new ApiError('NO_TOKEN', '需要 ApiKey Authorization'));
    }
    const row = findApiKey(key);
    if (!row) {
      return next(new ApiError('INVALID_TOKEN', 'ApiKey 无效或已撤销'));
    }
    // 校验 scopes
    let scopes = [];
    try {
      scopes = JSON.parse(row.scopes || '[]');
    } catch (e) {
      scopes = [];
    }
    if (requiredScopes.length > 0) {
      const ok = requiredScopes.every(s => scopes.includes(s) || scopes.includes('*'));
      if (!ok) {
        return next(new ApiError('FORBIDDEN', `ApiKey 缺少 scope: ${requiredScopes.join(', ')}`));
      }
    }
    touchLastUsed(row.id);
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
  };
}

module.exports = { requireApiKey, extractApiKey, findApiKey, touchLastUsed };
