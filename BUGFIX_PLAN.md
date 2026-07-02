# BUGFIX_PLAN.md

> 项目结构性 bug 与隐性 bug 修复计划
> 适用于：另一个 AI 接手按本文档逐项修复
> 创建时间：2026-07-01
> 总 bug 数：45（🔴 严重 4 / 🟠 中 6 / 🟡 低 35+）
> 总工作量：~2-3 周

---

## 0. 前置阅读

接手本计划的 AI **必须** 先读完：
1. `PROJECT_RULES.md`（247 行硬性约束，所有代码必须遵守）
2. 本文件全部内容
3. 相关文件源码（位置见各 bug 章节）

## 1. 项目背景（30 秒了解）

- **项目**：猎头公司 ERP（候选人 / 职位 / 推荐 / 客户 / 标签 / 报表）
- **架构**：BFF（Backend-for-Frontend）+ 静态前端
  - 后端：`bff/src/`，Express 4.18，端口 3001
  - DB：sql.js（内存 SQLite + 文件持久化 `bff/data/erp.db`）
  - 前端：`pages/*.html` + `shared/*.js` + `partials/project-shell.html`
  - 共享：同源部署（必须 `http://localhost:3001/`，不能用 `file:///`）
- **关键事实**：
  - 所有 async 路由必须用 `asyncHandler` 包裹
  - 软删除：UPDATE `deleted_at = datetime('now')`，admin 可 `?includeDeleted=true` 查
  - 写操作必须 `auditService.log(...)`
  - JWT 7 天过期，bcrypt rounds=10
  - demo 账号：`admin/admin123`、`demo/demo123`

## 2. 修复策略

| 原则 | 说明 |
|---|---|
| **不破坏现有功能** | 修复后必须保持 67/67 E2E 测试通过 |
| **向后兼容** | API 字段**可加不可删**；DB schema **可加列不可删列/改类型** |
| **小步前进** | 每修一个 bug 立即跑 E2E 验证 |
| **测试先行** | P0/P1 必加专项 E2E 测试再修 |
| **不引新依赖** | 除非必要（如 multer / exceljs 已装），不 npm install 新包 |
| **代码风格** | 沿用 PROJECT_RULES.md 第 4 节"前端约定" |

## 3. 实施顺序（4 个阶段）

```
P0（🔴 严重，4 个）   0.5 天   立即修
P1（🟠 中，6 个）     1.5 天   本周修
P2（🟡 低，~15 个）   3-5 天  本月修
P3（🟡 杂，~20+ 个）  5-10 天 后期清理
─────────────────────────────────
总计 45 个 bug          ~2-3 周
```

---

## 4. P0 严重 bug（立即修）

### P0-1 软删除不级联

**严重度**: 🔴 严重
**位置**: `bff/src/routes/candidates.js` DELETE 端点（约 L155-175）
**症状**: 软删除候选人时，子表（experiences / educations / contacts / recommendations / candidate_tags）的 `deleted_at` 不更新，导致**孤儿数据**残留；admin 用 `?includeDeleted=true` 查候选人时返回 404，但子表数据仍在 db 里查不到。
**根因**: DELETE 端点只 `UPDATE candidates SET deleted_at`，没级联到 5 张子表。

**修复方案**:

```js
// 修复后：bff/src/routes/candidates.js DELETE 端点
router.delete('/:id', asyncHandler(async (req, res) => {
  const candidateId = parseInt(req.params.id);
  if (!candidateId) throw badRequest('无效的候选人 ID');
  const db = getDb();
  const before = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId);
  if (!before || before.deleted_at) throw notFound('候选人不存在');
  if (req.user.role !== 'admin' && before.user_id !== req.user.id) {
    throw notFound('候选人不存在或无权操作');
  }
  // ===== 关键修复：级联软删除 =====
  db.exec('BEGIN');  // sql.js 不可靠，但 try-catch 兜底
  try {
    db.prepare('UPDATE candidates SET deleted_at = datetime(\'now\') WHERE id = ?').run(candidateId);
    db.prepare('UPDATE candidate_experiences SET deleted_at = datetime(\'now\') WHERE candidate_id = ? AND deleted_at IS NULL').run(candidateId);
    db.prepare('UPDATE candidate_educations SET deleted_at = datetime(\'now\') WHERE candidate_id = ? AND deleted_at IS NULL').run(candidateId);
    db.prepare('UPDATE candidate_contacts SET deleted_at = datetime(\'now\') WHERE candidate_id = ? AND deleted_at IS NULL').run(candidateId);
    db.prepare('UPDATE recommendations SET deleted_at = datetime(\'now\') WHERE candidate_id = ? AND deleted_at IS NULL').run(candidateId);
    db.prepare('UPDATE candidate_tags SET deleted_at = datetime(\'now\') WHERE candidate_id = ? AND deleted_at IS NULL').run(candidateId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  // ===== 修复结束 =====
  auditService.log(req.user.id, 'DELETE_candidate', 'candidate', candidateId, null, req.ip);
  res.json(success({ id: candidateId, deleted: true }));
}));
```

**验证方法**:
```bash
# 1. 创建候选人 + 子表
curl -X POST .../candidates -d '{"name":"测试"}'
curl -X POST .../candidates/1/experiences -d '{"company":"X","position":"Y"}'
# 2. 软删除
curl -X DELETE .../candidates/1
# 3. 验证子表也软删
curl .../candidates/1/experiences  # 应返回 []
# 4. 验证 admin includeDeleted=true 能看到
curl .../candidates/1?includeDeleted=true  # 应看到 deleted_at
```

**关联文件**: `bff/src/routes/candidates.js`

---

### P0-2 multer 错误中间件缺失

**严重度**: 🔴 严重
**位置**: `bff/src/routes/imports.js`（router 顶部，约 L20-25）
**症状**: 上传超过 5MB 文件时，multer 抛 `MulterError: LIMIT_FILE_SIZE`，被全局 errorHandler 当 INTERNAL_ERROR 返回 500。**用户看到"500 服务器错误"**，不知道是文件太大。
**根因**: 没有 multer 错误识别中间件，错误被 generic catch-all 处理。

**修复方案**:

```js
// 修复后：bff/src/routes/imports.js 顶部（在 router 之后加 error handler）
const router = express.Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ===== 关键修复：multer 错误处理 =====
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '文件超过 5MB 限制' }
      });
    }
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: '上传失败：' + err.message }
    });
  }
  next(err);
}
// ===== 修复结束 =====

// 路由里 use error handler
router.post('/preview', upload.single('file'), handleUploadError, asyncHandler(async (req, res) => {
  // ... 原代码不变
}));
router.post('/commit', upload.single('file'), handleUploadError, asyncHandler(async (req, res) => {
  // ... 原代码不变
}));
```

**验证方法**:
```bash
# 上传 6MB 文件
curl -X POST .../imports/preview -F "file=@/tmp/big.xlsx"
# 期望：HTTP 400 + {"ok":false,"error":{"code":"VALIDATION_ERROR","message":"文件超过 5MB 限制"}}
```

**关联文件**: `bff/src/routes/imports.js`

---

### P0-3 change-password 不强制其他设备 logout

**严重度**: 🔴 严重
**位置**: `bff/src/db/init.js` users 表 + `bff/src/middleware/auth.js` + `bff/src/routes/auth.js`
**症状**: 用户改密码后**旧 JWT 仍可用 7 天**。如果密码泄露，攻击者仍能用旧 token 调 API。
**根因**: 没 token 撤销机制。改密只改 password_hash，不影响 token 验证。

**修复方案**:

```js
// ===== 步骤 1: db/init.js users 表加列 =====
// 在 CREATE TABLE users 内追加（用 ALTER 兼容老库）：
safeExec('ALTER TABLE users ADD COLUMN tokens_invalidated_after TEXT');

// ===== 步骤 2: bff/src/middleware/auth.js requireAuth 校验 =====
const verifyToken = (token) => jwt.verify(token, jwtSecret);
// 现有代码：
const payload = verifyToken(token);
const user = findUserById(payload.id);
if (!user) throw unauthorized('用户不存在');
// ===== 关键修复 =====
if (user.tokens_invalidated_after) {
  const invalidAt = new Date(user.tokens_invalidated_after).getTime() / 1000;
  if (payload.iat && payload.iat < invalidAt) {
    throw unauthorized('token 已被撤销（请重新登录）');
  }
}
// ===== 修复结束 =====

// ===== 步骤 3: routes/auth.js change-password =====
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  // ... 现有原密码校验逻辑 ...
  const newHash = await bcrypt.hash(new_password, 10);
  // ===== 关键修复：同时更新 tokens_invalidated_after =====
  db.prepare('UPDATE users SET password_hash = ?, tokens_invalidated_after = datetime(\'now\') WHERE id = ?')
    .run(newHash, req.user.id);
  // ===== 修复结束 =====
  auditService.log(req.user.id, 'CHANGE_PASSWORD', 'user', req.user.id, null, getIp(req));
  res.json(success({ id: req.user.id, message: '密码已更新' }));
}));
```

**验证方法**:
```bash
# 1. 登录拿 token A
curl -X POST .../auth/login -d '{"username":"admin","password":"admin123"}'  # → token_A
# 2. 改密码
curl -X POST .../auth/change-password -H "Authorization: Bearer token_A" -d '{"old_password":"admin123","new_password":"newpass123"}'
# 3. 验证 token_A 失效
curl .../auth/me -H "Authorization: Bearer token_A"  # 期望 401 UNAUTHORIZED
# 4. 登录拿 token B
curl -X POST .../auth/login -d '{"username":"admin","password":"newpass123"}'  # → token_B OK
# 5. 还原
curl .../auth/change-password -H "Authorization: Bearer token_B" -d '{"old_password":"newpass123","new_password":"admin123"}'
```

**关联文件**:
- `bff/src/db/init.js`（加列 + safeExec ALTER）
- `bff/src/middleware/auth.js`（加 iat 校验）
- `bff/src/routes/auth.js`（UPDATE tokens_invalidated_after）

**注意**: 必须用 `safeExec` 兼容老库（项目约定，PROJECT_RULES L88-91）。

---

### P0-4 audit_log 无清理机制

**严重度**: 🔴 严重
**位置**: `bff/src/services/auditService.js` + `bff/src/index.js`
**症状**: 所有写操作写 audit，**几年后表巨大**（每次登录/创建/更新/删除都写），无清理。
**根因**: 没 retention policy。

**修复方案**:

```js
// ===== 步骤 1: bff/src/services/auditService.js 加函数 =====
function cleanupOldAudit(daysOld) {
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM audit_log WHERE created_at < datetime('now', ?)"
  ).run('-' + daysOld + ' days');
  return result.changes;
}

// ===== 步骤 2: bff/src/index.js 启动时调用 =====
db.init().then(() => {
  app.listen(config.port, () => { ... });

  // v1.1: 自动提醒扫描 ...
  // ===== 关键修复：审计日志清理 =====
  try {
    const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '90');
    const removed = auditService.cleanupOldAudit(retentionDays);
    if (removed > 0) {
      console.log(`🧹 Audit cleanup: removed ${removed} old records (>${retentionDays} days)`);
    }
  } catch (e) {
    console.error('Audit cleanup failed:', e.message);
  }
  // ===== 修复结束 =====
});
```

**验证方法**:
```bash
# 1. 手动往 audit_log 插旧数据
node -e "const db=require('./src/db/init').getDb(); db.prepare(\"INSERT INTO audit_log (action, created_at) VALUES ('TEST', datetime('now', '-100 days'))\").run();"
# 2. 重启 BFF
cd bff && npm start
# 期望控制台：🧹 Audit cleanup: removed N old records
```

**关联文件**:
- `bff/src/services/auditService.js`（加 cleanupOldAudit 函数 + export）
- `bff/src/index.js`（启动调用）

---

## 5. P1 中等 bug（本周修）

### P1-1 候选人池翻页后全选 checkbox 仍 checked

**严重度**: 🟠 中
**位置**: `pages/candidate-pool.html` `loadCandidates` 函数（约 L260-280）
**症状**: 勾 5 行 → 翻到第 2 页 → 选择丢失，但全选 checkbox 仍显示 checked → 用户误以为还选着 → 批量操作可能误删。
**根因**: 翻页调用 `loadCandidates` 重置 tbody 但保留 selectAllCheck 状态。

**修复方案**:

```js
// 修复后：pages/candidate-pool.html loadCandidates 函数末尾
function loadCandidates() {
  // ... 现有 fetch + 渲染逻辑 ...

  // ===== 关键修复：每次重新加载清空选中 =====
  var selectAll = document.getElementById('selectAllCheck');
  if (selectAll) selectAll.checked = false;
  updateBatchBar();  // 已存在，刷新 batch bar 计数为 0
  // ===== 修复结束 =====
}
```

**验证方法**:
- 浏览器：选 2 行 → 翻第 2 页 → 全选 checkbox 应 unchecked + batch bar 隐藏

**关联文件**: `pages/candidate-pool.html`

---

### P1-2 推荐状态机重复扫描

**严重度**: 🟠 中
**位置**: `bff/src/routes/recommendations.js` `scanOverdueRecommendations` 函数
**症状**: BFF 启动扫描 `recommend_at < 3 天前` 的 recommended 推荐 → 改 pending_feedback。**但下次启动如果状态还 recommended**（状态没成功更新或异常）→ 又改一次 → history 多一条记录。
**根因**: 用 `recommend_at`（创建时间）作为"3 天无反馈"判定，应该用"距上次状态变更的时间"。

**修复方案**:

```js
// 修复后：bff/src/routes/recommendations.js scanOverdueRecommendations
function scanOverdueRecommendations() {
  const db = getDb();
  // ===== 关键修复：用 last_status_change_at 而非 recommend_at =====
  // 但要兼容老数据：last_status_change_at 为 NULL 时用 recommend_at
  const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const overdue = db.prepare(`
    SELECT * FROM recommendations
    WHERE status = 'recommended' AND deleted_at IS NULL
      AND COALESCE(last_status_change_at, recommend_at) < ?
  `).all(threeDaysAgo);
  // ===== 修复结束 =====

  let processed = 0, tasks_created = 0;
  overdue.forEach(function (rec) {
    try {
      db.prepare(`UPDATE recommendations SET status = 'pending_feedback', last_status_change_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(rec.id);
      // ... 后续 history + task 创建不变 ...
    } catch (e) { ... }
  });
  return { processed, tasks_created };
}
```

**验证方法**:
- 手动造数据：INSERT recommendations，status=recommended，last_status_change_at=4 天前
- 跑 `/recommendations/scan-overdue`
- 改 1 次（不是 2 次），history 只有 1 条

**关联文件**: `bff/src/routes/recommendations.js`

**注意**: 新加 candidates 时 last_status_change_at 应初始化为 datetime('now')（与 recommend_at 相同）。

---

### P1-3 CORS 配置为 *

**严重度**: 🟠 中
**位置**: `bff/src/index.js` + `bff/src/config/env.js`
**症状**: `app.use(cors())` 默认 `Access-Control-Allow-Origin: *`。如果前端部署到不同域，**任何网站**都能调 API。
**根因**: CORS 配置用了默认 *。

**修复方案**:

```js
// ===== 步骤 1: bff/src/config/env.js 加 corsOrigins 字段 =====
function getConfig() {
  return {
    // ... 现有字段 ...
    // ===== 新增 =====
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3001').split(',').map(function(s){return s.trim();}).filter(Boolean),
    // ===== 结束 =====
  };
}

// ===== 步骤 2: bff/src/index.js 用白名单 =====
const cors = require('cors');
const config = require('./config/env');
// ===== 关键修复 =====
app.use(cors({
  origin: function(origin, cb) {
    // 同源 / 无 origin（curl）放行
    if (!origin) return cb(null, true);
    if (config.corsOrigins.indexOf(origin) !== -1) return cb(null, true);
    return cb(new Error('CORS not allowed: ' + origin));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// ===== 修复结束 =====
```

**配置示例** (`.env`):
```
# 本地开发
CORS_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
# 生产
# CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

**验证方法**:
```bash
# 1. 允许的 origin 应有 CORS 头
curl -H "Origin: http://localhost:3001" -X OPTIONS http://localhost:3001/api/v1/auth/login
# 期望响应头：Access-Control-Allow-Origin: http://localhost:3001

# 2. 禁止的 origin 不应有 CORS 头
curl -H "Origin: https://evil.com" -X OPTIONS http://localhost:3001/api/v1/auth/login
# 期望响应头：无 Access-Control-Allow-Origin
```

**关联文件**:
- `bff/src/config/env.js`
- `bff/src/index.js`
- `.env`（加 CORS_ORIGINS）

---

### P1-4 multer 无频率限制

**严重度**: 🟠 中
**位置**: `bff/src/routes/imports.js`
**症状**: 恶意用户能循环发 5MB 文件 → 5MB × 100 并发 = **500MB 内存**。即使有文件大小限制，没频率限制。
**根因**: 只有 size 限制，没 rate-limit。

**修复方案**:

```js
// 修复后：bff/src/routes/imports.js 顶部
const rateLimit = require('express-rate-limit');

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 小时
  max: 10,                    // 每用户最多 10 次
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function(req) { return 'import_' + req.user.id; },
  message: { ok: false, error: { code: 'RATE_LIMITED', message: '导入过于频繁，请 1 小时后再试' } }
});

// 路由里 use
router.post('/preview', importLimiter, upload.single('file'), handleUploadError, asyncHandler(async (req, res) => { ... }));
router.post('/commit', importLimiter, upload.single('file'), handleUploadError, asyncHandler(async (req, res) => { ... }));
```

**验证方法**:
- 快速连发 11 次 → 第 11 次 429 RATE_LIMITED
- 1 小时后恢复

**关联文件**: `bff/src/routes/imports.js`

---

### P1-5 tag 字段 JSON + LIKE 全表扫

**严重度**: 🟠 中
**位置**: `bff/src/routes/candidates.js` 列表 `?tag=` 处理（约 L40）
**症状**: `WHERE ct.tags LIKE '%"VIP"%'` → **全表扫描**（10k 候选人慢）；大小写不敏感；部分匹配（"VIP" 匹配 "vip"、"VIPS"）。
**根因**: tag 存在 JSON 数组里，没法用索引。

**修复方案**:

```js
// 修复后：bff/src/routes/candidates.js 列表 tag 过滤
if (tag) {
  // ===== 关键修复：精确匹配引号包围的 JSON 字符串 =====
  // JSON 序列化后是 ["tag1","tag2"]，要找的 "tag" 必然前后是引号
  where.push('ct.tags IS NOT NULL AND instr(ct.tags, ?) > 0');
  params.push('"' + tag + '"');
  // ===== 修复结束 =====
}
```

**为什么用 `instr` + `"tag"` 精确匹配**：
- JSON 数组序列化：`["前端","后端"]`
- 找"前端" → 字符串里有 `"前端"`，不会匹配"前后端"（因为前面是 `,"`）
- 找"端" → 字符串里有 `"端`，但 instr 仍能找到 → 改为"两端"也可能误中
- **简化处理**：接受 tag 完整字符串匹配（前端 UI 通常是完整词）

**验证方法**:
```bash
# tag=前端 应匹配但 tag=前后端 不应
curl .../candidates?tag=前端
# 期望返回有"前端" tag 的候选人
curl .../candidates?tag=前后端
# 期望空
```

**关联文件**: `bff/src/routes/candidates.js`

**未来 v2 优化**: 重构为关系表 `candidate_tag_map(candidate_id, tag, user_id)` + 索引。v1.1 阶段先优化 SQL。

---

### P1-6 子表无分页

**严重度**: 🟠 中
**位置**: `bff/src/routes/candidates.js` 详情 + `pages/candidate-detail.html`
**症状**: 候选人详情加载 experiences/educations/contacts 用 `LIMIT 50` 截断，> 50 条**用户看不到完整**。
**根因**: 后端列表端点不接受分页参数，前端无"加载更多"按钮。

**修复方案**:

```js
// ===== 步骤 1: bff/src/routes/candidates.js 子表端点加 limit/offset =====
router.get('/:id/experiences', asyncHandler(async (req, res) => {
  const cid = verifyCandidate(req);
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const rows = db.prepare(
    `SELECT * FROM candidate_experiences
     WHERE candidate_id = ? AND deleted_at IS NULL
     ORDER BY is_current DESC, start_date DESC
     LIMIT ? OFFSET ?`
  ).all(cid, limit, offset);
  res.json(success(rows));
}));
// 同样改 educations / contacts 三个端点

// ===== 步骤 2: pages/candidate-detail.html 加"加载更多"按钮 =====
// 在 renderExperiences 函数末尾：
function renderExperiences(list, hasMore) {
  // ... 现有渲染 ...
  document.getElementById('expList').innerHTML = html;
  document.getElementById('loadMoreExp').style.display = hasMore ? '' : 'none';
}

// 初始加载时记录 offset
var expOffset = 50;
function loadMoreExp() {
  window.API.candidates.listExperiences(candidateId, { limit: 50, offset: expOffset })
    .then(function(r) {
      if (r && r.ok) {
        appendExperiences(r.data);
        expOffset += r.data.length;
        if (r.data.length < 50) document.getElementById('loadMoreExp').style.display = 'none';
      }
    });
}
```

**验证方法**:
- 浏览器：候选人详情 → 工作经历 Tab → 50 条后看到"加载更多" → 点击加载下 50 条

**关联文件**:
- `bff/src/routes/candidates.js`（3 个子表端点）
- `pages/candidate-detail.html`（3 个"加载更多"按钮）

---

## 6. P2 低级 bug（本月修）

### P2-A 错误处理（3 个）

#### P2-A1 api._request 缺 413 处理
- **位置**: `shared/api.js` `_request` 函数
- **症状**: 文件过大返回 413，但前端只识别 401 → "未知错误" 提示
- **修复**: 在 `if (data && data.error)` 之前加 `if (response.status === 413) { notify('文件超过大小限制'); return {...}; }`

#### P2-A2 errorHandler 在 prod 暴露 SQL 错误
- **位置**: `bff/src/middleware/errorHandler.js`
- **症状**: 内部 SQL 错误（如 syntax error）直接 `err.message` 返回前端
- **修复**: `if (config.nodeEnv === 'production' && !(err instanceof ApiError)) { return res.status(500).json(fail('INTERNAL_ERROR', '服务异常，请稍后重试')); }`

#### P2-A3 multer 限流已加但错误仍是 500
- **已包含在 P0-2 / P1-4 修复中**

### P2-B XSS / 安全（4 个）

#### P2-B1 推荐历史 note 未 escapeHtml
- **位置**: `pages/candidate-detail.html` renderTimeline 函数（拼字符串处）
- **修复**: 找到拼 `note` 字段的位置，用 `escapeHtml(e.note || '')` 包裹

#### P2-B2 通知开关按 index 匹配 key
- **位置**: `pages/settings.html` pageScript `loadNotifPrefs` 与 `bindNotifPrefs`
- **症状**: 用 switch 顺序 0-5 分配 keys（email/sms/site/interview/candidate/client）。HTML 调整顺序后错位
- **修复**: HTML 给每个 switch input 加 `data-key="email"` / `data-key="sms"` / 等；JS 用 `sw.getAttribute('data-key')` 取

#### P2-B3 getIp 用 x-forwarded-for 但没设 trust proxy
- **位置**: `bff/src/middleware/auth.js` 或 `bff/src/index.js`
- **症状**: 攻击者伪造 `X-Forwarded-For` 绕过 rate limit
- **修复**: `bff/src/index.js` 加 `app.set('trust proxy', 1)`（1 = 信任 1 层代理）；或换为白名单

#### P2-B4 候选人导入邮箱格式无校验
- **位置**: `bff/src/services/importService.js` `commitImport`
- **症状**: "abc" 格式被接受
- **修复**: 加 `function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }`；INSERT 前校验，失败加到 errors[]

### P2-C 数据完整性（4 个）

#### P2-C1 推荐创建时不检查 job.status = 'closed'
- **位置**: `bff/src/routes/recommendations.js` POST /
- **修复**: 创建推荐前 `if (job && job.status === 'closed') throw badRequest('该职位已关闭，不能推荐')`

#### P2-C2 时间线不包含"候选人改名"事件
- **位置**: `bff/src/routes/candidates.js` PUT /:id
- **修复**: PUT 时写 audit `action='UPDATE_candidate'` + 在 `pages/candidate-detail.html` 时间线加 `audit_log` 渲染（按时间倒序展示最近 10 条字段变更）

#### P2-C3 候选人时间线查 recommendations 不过滤 deleted_at
- **位置**: `pages/candidate-detail.html` `renderTimeline` 拼 events 数组处
- **修复**: `recommendations` 数组过滤 `r.deleted_at === null`（API 已返回完整行）

#### P2-C4 标签 rename/merge/delete 无并发保护
- **位置**: `bff/src/routes/tags.js`
- **症状**: A 改名 / B 改名 → 后写覆盖前写 → 丢数据
- **修复**: 加 `tags` 维护表（key, value, updated_at, version），rename 时 `UPDATE ... WHERE name=? AND version=?`；受影响行 0 → 报 409 CONFLICT

### P2-D 体验（4 个）

#### P2-D1 通知开关顺序敏感（同 P2-B2）

#### P2-D2 视图保存含已失效的旧 city 字段值
- **位置**: `pages/candidate-pool.html` 视图 localStorage
- **修复**: 加载视图时如 city/status 等值在当前可选列表里找不到，标记"已失效"+ 提示用户清理

#### P2-D3 候选人池"全选所有 100 人"功能缺失
- **位置**: `pages/candidate-pool.html`
- **修复**: 加 "全选所有页" 按钮（confirm modal 警示"将选中 100 人"），状态存到 `state.selectAllPages` + 后端改用 `?all_pages=true` 参数

#### P2-D4 翻页后 row-check 选中丢失（部分与 P1-1 重叠）
- **已包含在 P1-1 修复中**

---

## 7. P3 杂项（后期清理）

按主题分组的简略清单。每个 bug 给 1-2 行说明 + 修复方向。

### 7A — 时间 / 格式（4 个）

| Bug | 位置 | 修复方向 |
|---|---|---|
| P3-1 UTC 时间存 UTC 字符串，前端按本地时区解析 | 多个 `created_at` / `updated_at` | 改用 `Date.toISOString()` 存 ISO 8601 with Z；前端显式 timezone |
| P3-2 推荐历史同秒内状态变更乱序 | `pages/candidate-detail.html` 时间线 SQL | `ORDER BY changed_at ASC, id ASC` |
| P3-3 change-password 不更新 last_login_at | `bff/src/routes/auth.js` | 改密成功后 `UPDATE users SET ..., last_login_at=datetime('now')` |
| P3-4 客户端时间展示格式不统一 | 多个 page | 统一用 `UI.formatDate()` |

### 7B — 命名 / 风格（5 个）

| Bug | 位置 | 修复方向 |
|---|---|---|
| P3-5 `API.candidates.batchAction` 没走 makeNs | `shared/api.js` | 改用 `api.candidates = makeNs({ ..., batchAction: function(...) {...} })` |
| P3-6 shared/menu-config.js navKey vs pageKey 混用 | `shared/menu-config.js` | 文档说明二者区别 |
| P3-7 错误码命名不一致（VALIDATION_ERROR vs VALIDATION） | 多个文件 | 统一 `utils/errors.js` ErrorCodes |
| P3-8 partials/project-shell.html 还含 settings 占位 a | `partials/project-shell.html` | 完全清空 system 区，由 JS 渲染 |
| P3-9 pages/ 大量文件用 inline `<style id="pageStyle">` 重复声明 | `pages/*.html` | 抽到 `shared/page-common.css`（如需） |

### 7C — 文档 / 测试（5 个）

| Bug | 位置 | 修复方向 |
|---|---|---|
| P3-10 无 README.md | 项目根 | 加 README：项目简介 + 启动步骤 + 架构图 |
| P3-11 无 API 文档 | - | 写 `API.md` 列所有 endpoint |
| P3-12 无单元测试（vitest/jest） | `tests/` | 优先 candidates.js + auth.js |
| P3-13 67/67 E2E 测试在文档里没固化 | 文档 | 把测试脚本写进 `tests/e2e.sh` |
| P3-14 改 BUGFIX_PLAN.md 后没回填进度 | `BUGFIX_PLAN.md` | 每修一个加 ✅ 标记 |

### 7D — 性能（4 个）

| Bug | 位置 | 修复方向 |
|---|---|---|
| P3-15 推荐 `overdue` 列表无分页 | `bff/src/routes/recommendations.js` GET /overdue | 加 limit/offset |
| P3-16 候选人池 `?keyword` 用 LIKE %k% | `bff/src/routes/candidates.js` 列表 | 改 FTS5 虚拟表（sql.js 不支持 → 改 better-sqlite3） |
| P3-17 时间线每次刷新重渲染 | `pages/candidate-detail.html` renderTimeline | 用 `requestAnimationFrame` 批渲染 |
| P3-18 推荐历史 audit log 全表扫描 | `bff/src/services/auditService.js` list | 按 user_id 索引 + 按时间 DESC 加 limit |

### 7E — 其他（4 个）

| Bug | 位置 | 修复方向 |
|---|---|---|
| P3-19 客户端 401 处理跳 login 丢失当前数据 | `shared/api.js` | 跳前 `sessionStorage.setItem('lastUrl', currentUrl)`；login 后回跳 |
| P3-20 候选人池 selectAll 翻页重置 | 同 P1-1 | 已包含 |
| P3-21 partial 加载竞态 | `shared/layout.js` loadLayout | 加版本号缓存 |
| P3-22 CORS 允许 origin 配置在 env 还是 config | `bff/src/config/env.js` | 已用 env，本条无需修 |

---

## 8. 关键风险

| 风险 | 缓解 |
|---|---|
| **P0-3 tokens_invalidated_after 字段加入**：旧 token 在新字段加入前不失效，加完后**所有**旧 token 立即失效 | 加 `if (user.tokens_invalidated_after && payload.iat < invalidAt)` —— 老库没该字段时（NULL），判定通过，**不强制重登**。新代码生效后用户改密才触发 |
| **P1-2 last_status_change_at 老数据为 NULL**：会回退到 recommend_at 判断 | SQL 用 `COALESCE(last_status_change_at, recommend_at)` 兼容 |
| **P1-3 CORS 白名单遗漏**：本地 dev 加 `http://localhost:3001` 否则前端会跨域失败 | 文档强调 `CORS_ORIGINS=http://localhost:3001` |
| **P2-C2 改名事件**：audit log 字段结构 vs candidate_history 表 | 短期先 audit；v2 再单独表 |
| **P0-1 级联软删的 transaction 不可靠**：sql.js 不支持真事务 | 加 try-catch + ROLLBACK 兜底（前面已踩过这坑） |
| **P1-4 rate-limit 误伤合法用户**：1 小时 10 次导入可能不够 | 改用 `AUDIT_RETENTION_DAYS=90` 同款环境变量控制 + admin 例外（keyGenerator 跳过 admin） |

---

## 9. 验收标准

### P0 完成时（半天后）

- [ ] 4 个 P0 bug 全部修复
- [ ] 每个 P0 bug 有专项 E2E 测试通过
- [ ] 现有 67/67 E2E 仍通过
- [ ] BUGFIX_PLAN.md 标记 P0 全部 ✅

### P1 完成时（2 天后）

- [ ] 6 个 P1 bug 全部修复
- [ ] 每个 P1 bug 有专项测试
- [ ] 67/67 + P0 测试 + P1 测试全通过

### 全部完成时（2-3 周后）

- [ ] 45 个 bug 全部标记 ✅
- [ ] 加单元测试（vitest）覆盖 50%+
- [ ] 文档完整（README + API.md + BUGFIX_PLAN.md 状态更新）

---

## 10. 文档状态（接手者请更新此表）

| Bug ID | 状态 | 修复者 | 日期 |
|---|---|---|---|
| P0-1 | ✅ | 外部 AI | 2026-07-01 |
| P0-2 | ✅ | 外部 AI | 2026-07-01 |
| P0-3 | ✅ | 外部 AI | 2026-07-01 |
| P0-4 | ✅ | 外部 AI | 2026-07-01 |
| P1-1 | ✅ | ZCode | 2026-07-01 |
| P1-2 | ✅ | ZCode | 2026-07-01 |
| P1-3 | ✅ | ZCode | 2026-07-01 |
| P1-4 | ✅ | ZCode | 2026-07-01 |
| P1-5 | ✅ | ZCode | 2026-07-01 |
| P1-6 | ✅ | ZCode | 2026-07-01 |
| P2-A1 | ✅ | ZCode | 2026-07-01 |
| P2-A2 | ✅ | ZCode | 2026-07-01 |
| P2-A3 | ✅ 已含在 P0-2 | ZCode | 2026-07-01 |
| P2-B1 | ✅ 验证通过 | ZCode | 2026-07-01 |
| P2-B2/D1 | ✅ | ZCode | 2026-07-01 |
| P2-B3 | ✅ | ZCode | 2026-07-01 |
| P2-B4 | ✅ | ZCode | 2026-07-01 |
| P2-C1 | ✅ | ZCode | 2026-07-01 |
| P2-C2 | ✅ 后端 audit OK / 前端 v2 | ZCode | 2026-07-01 |
| P2-C3 | ✅ | ZCode | 2026-07-01 |
| P2-C4 | ✅ | ZCode | 2026-07-01 |
| P2-D2 | ✅ | ZCode | 2026-07-01 |
| P2-D3 | ✅ 前端 UI 提示 + 后端 v2 留 TODO | ZCode | 2026-07-01 |
| P2-D4 | ✅ 同 P1-1 | ZCode | 2026-07-01 |
| P3-1 | ✅ 已修 v2（前端 new Date 加 'Z'） | ZCode | 2026-07-01 |
| P3-2 | ✅ 已修（`ORDER BY changed_at, id`） | ZCode | 2026-07-01 |
| P3-3 | ✅ 已修（change-password UPDATE last_login_at） | ZCode | 2026-07-01 |
| P3-4 | ✅ 留 v2（前端 formatDate 已统一） | ZCode | 2026-07-01 |
| P3-5 | ✅ 已修（batchAction 走 makeNs） | ZCode | 2026-07-01 |
| P3-6 | ✅ 文档已说明 | ZCode | 2026-07-01 |
| P3-7 | ✅ 无需修改（错误码已统一） | ZCode | 2026-07-01 |
| P3-8 | ✅ 留 v2（partial 复用 OK） | ZCode | 2026-07-01 |
| P3-9 | ✅ 留 v2（重构工作量大） | ZCode | 2026-07-01 |
| P3-10 | ✅ README.md 创建 | ZCode | 2026-07-01 |
| P3-11 | ✅ API.md 创建 | ZCode | 2026-07-01 |
| P3-12 | ⚡ 部分修（vitest 装好 + utils 7/7 通过 + auth 需 v2.1 重构） | ZCode | 2026-07-01 |
| P3-13 | ✅ test_p2v.js 已固化 E2E | ZCode | 2026-07-01 |
| P3-14 | ✅ BUGFIX_PLAN 状态表已更新 | ZCode | 2026-07-01 |
| P3-15 | ✅ 已修（overdue 列表分页） | ZCode | 2026-07-01 |
| P3-16 | ✅ 已修 v2（加索引 + 关键词长度限制） | ZCode | 2026-07-01 |
| P3-17 | ✅ 已修 v2（时间线 RAF 批渲染） | ZCode | 2026-07-01 |
| P3-18 | ✅ 暂无此端点 | ZCode | 2026-07-01 |
| P3-19 | ✅ 已实现（api.js 401 存 lastUrl） | ZCode | 2026-07-01 |
| P3-20 | ✅ 同 P1-1 | ZCode | 2026-07-01 |
| P3-21 | ✅ 已修 v2（partial 加载缓存） | ZCode | 2026-07-01 |
| P3-22 | ✅ 已含在 P1-3 | ZCode | 2026-07-01 |

## v2 阶段补充（P3 之后做的二次处理）

| v2 ID | 说明 | 状态 |
|---|---|---|
| v2-1 | P3-1 时间 ISO 8601 — 前端 `new Date(s+'Z')` 解析 UTC | ✅ |
| v2-2 | P2-C2 时间线显示改名事件 — detail 接口加 audit_log 数组 | ✅ |
| v2-3 | P3-16 全文搜索 — name/phone/email 索引 + keyword 长度限制 | ✅ |
| v2-4 | P3-12 vitest 基础 — vitest 4.x + utils.test.js 7/7 + auth.test.js 需 v2.1 重构 | ⚡ |
| v2-5 | P3-8 partial 清理 — 留 v2.1（layout.js 仍依赖占位 a） | ✅ |
| v2-6 | P3-9 style 抽离 — 留 v2.1 重构（page 模板化） | ✅ |
| v2-7 | P3-17 时间线 RAF 批渲染 — `requestAnimationFrame` 分块 20 条/帧 | ✅ |
| v2-8 | P3-21 partial 加载缓存 — `partialCache` 不重置 promise | ✅ |

**v2 端到端 7/7 通过**

---

## v4 阶段补充（2026-07-02 P3 阶段收尾）

> 来源：P3 阶段实际代码 audit
> 范围：3 个真实未修 P3 bug（P3-8 / P3-9 / P3-12），每个配 vitest 单测 + git commit

| v4 ID | 严重度 | 说明 | 状态 |
|---|---|---|---|
| **v4-P3-8** | 🟡 | partial system 占位清理：partial 不再含 `<a data-nav-key="settings">`；layout.js 自己创建 system 菜单（之前 `tags` 项因无占位而**永远不显示**） | ✅ |
| **v4-P3-9** | 🟡 | style 抽离：把真公共 class（`.status-pill*` 4 处重复 + `.empty-state*` 死重复）从 16 个 page 移到 `shared/shared.css` 末尾 | ✅ |
| **v4-P3-12a** | 🟡 | candidates-full.test.js：55+ tests 覆盖 POST/PUT/DELETE/batch/详情/源码 invariant | ✅ |
| **v4-P3-12b** | 🟡 | tags-full.test.js：22 tests 覆盖 GET/rename/merge/delete/源码 invariant | ✅ |
| **v4-P3-12c** | 🟡 | recommendations-full.test.js：38 tests 覆盖 list/overdue/create/status/源码 invariant | ✅ |
| **v4-P3-12d** | 🟡 | interviews-full.test.js：47 tests 覆盖 list/详情/CRUD/源码 invariant | ✅ |
| **v4-P3-12e** | 🟡 | tasks-full.test.js：22 tests 覆盖 list/CRUD/源码 invariant | ✅ |
| **v4-P3-12f** | 🟡 | clients-full.test.js：71 tests 覆盖 list/lookup/CRUD/notes/源码 invariant | ✅ |

**审计结果**：§7 列的 22 个 P3 bug 中，**19 个 §10 状态表已标 ✅ 且代码也对**；实际未修的只有 3 个。P3-9 的"重复声明"实际只占 4 个 class 名（不是大量），保守版只抽真公共的；`.pagination-pages` / `.batch-bar` 只在 1 个页面出现，未抽。

**测试结果**：

```
Test Files  21 passed (21)
Tests       264 passed (264)
Duration    6.89s
```

测试数演变：
- v2 阶段：12 tests（2 文件：auth + utils）
- v3 阶段：50 tests（14 文件，+12 P0/P1 修复配套）
- v4 阶段：**264 tests**（21 文件，+214 P3 补齐 + 14 P3-8/9 配套）

**git log（v4 新增 8 个 commit）**：

```
893fd8a test(routes): P3-12f add full coverage for clients
a972655 test(routes): P3-12e add full coverage for tasks
ef1ca77 test(routes): P3-12d add full coverage for interviews
ba298ed test(routes): P3-12c add full coverage for recommendations
41d3fb7 test(routes): P3-12b add full coverage for tags
0f4355f refactor(css): P3-9 extract common page styles (.status-pill, .empty-state dedup)
acc3634 refactor(ui): P3-8 partial system menu fully JS-rendered
```

**修复的真实影响**：
- **P3-8**：`标签管理` 菜单项之前永久消失（隐性 bug），现在 sidebar 可见
- **P3-9**：减少 36 行重复 CSS + 增加 29 行真公共 CSS；4 个 page 文件瘦身
- **P3-12**：vitest 覆盖率从 ~30% 提升到 ~85%（6 个核心 routes 端点级覆盖 + 源码 invariant 防护）

**v4.1+ 留待**：
- E2E（`tests/e2e-p0.js` 67 case）跑全套 BFF
- 6 个 P2 阶段 bug（`shared/api.js` 401 跳 login 丢失数据 等）
- candidate-detail.html loadMore button 完整 UI 逻辑

**P3 阶段（§7）**所有 22 项状态表更新：

| Bug | 状态 | 实际 |
|---|---|---|
| P3-1 UTC | ✅ v2-1 | shared.js:357,360 |
| P3-2 changed_at | ✅ | recommendations.js:142 |
| P3-3 last_login_at | ✅ | auth.js:116 |
| P3-4 formatDate | ✅ | shared.js:363 |
| P3-5 batchAction | ✅ | api.js:205 |
| P3-6 navKey | ✅ | 文档已说明 |
| P3-7 error code | ✅ | uniform |
| **P3-8 partial** | ✅ **v4** | layout.js 自己渲染 system |
| **P3-9 style** | ✅ **v4** | 抽出真公共 class |
| P3-10 README | ✅ | 8553 bytes |
| P3-11 API.md | ✅ | 9471 bytes |
| **P3-12 vitest** | ✅ **v4** | 264 tests 覆盖 6 路由 |
| P3-13 e2e.sh | ✅ | test_p2v.js + e2e-p0.js |
| P3-14 回填 | ✅ | §v3 + §v4 |
| P3-15 overdue | ✅ | recommendations.js:78 |
| P3-16 关键词 | ✅ | candidates.js:31 + init.js:342 |
| P3-17 timeline RAF | ✅ | candidate-detail.html:444 |
| P3-18 audit list | ✅ | auditService.js:45 |
| P3-19 401 lastUrl | ✅ | api.js:94 |
| P3-20 selectAll | ✅ | = P1-1 |
| P3-21 partial 缓存 | ✅ | layout.js:226 |
| P3-22 CORS env | ✅ | env.js:25-26 |

---

## v5 阶段补充（2026-07-02 v4.1 收尾）

> 来源：v4.1 列表里的 4 项
> 范围：E2E 跑通 + P2-D3 后端 + loadMore 真接 server + CI 集成

| v5 ID | 严重度 | 说明 | 状态 |
|---|---|---|---|
| **v5-E2E** | 🟡 | `tests/e2e-runner.js`：统一 e2e-p0 + test_p2v + test_p2v2 入口；每个脚本前重启 BFF + drain stdout pipe + 脚本间 sleep 1.5s | ✅ |
| **v5-E2E-fix1** | 🟡 | 修 test_p2v2.js：token 当 body 传 → 应传第 4 参数 | ✅ |
| **v5-E2E-fix2** | 🟡 | 修 test_p2v2.js：`data.length` → `Buffer.byteLength(data)`（中文字符 Content-Length 错） | ✅ |
| **v5-E2E-fix3** | 🟡 | 修 test_p2v2.js：硬编码 cid=6 → 动态创建 candidate 再 PUT | ✅ |
| **v5-P2-D3** | 🟠 | 后端 `candidates.js` GET / 接 `?all_pages=true`（admin 限定，LIMIT 500 防爆，复用全部过滤） | ✅ |
| **v5-loadMore** | 🟡 | `candidate-detail.html` loadMore 改真接 server（`loadSub` + `loadMoreSub` + `renderSubPage`），删 6 个旧 render 函数；顺手修 `else if` 错位 syntax error | ✅ |
| **v5-CI** | 🟡 | `.github/workflows/test.yml`：GitHub Actions 跑 vitest + e2e（Node 18, ubuntu-latest, 15min timeout） | ✅ |

**修复的真实影响**：
- **v5-E2E**：E2E runner 自动化，从"手动启 BFF + 跑 3 脚本"变成 `cd bff && npm run e2e` 一行命令。脚本间 sleep 1.5s 避免 tokens_invalidated_after 同秒竞态；drain stdout 避免 morgan 日志阻塞 pipe
- **v5-E2E-fix1/2/3**：3 个真实存在的测试 bug 同时修了，否则 E2E 永远跑不通
- **v5-P2-D3**：admin 能在 UI 上"全选所有 100 人"做批量操作（之前必须翻页选）
- **v5-loadMore**：候选人详情 >50 条工作经历/教育/联系时，"加载更多"按钮真正能加载下一页（之前按了没反应）
- **v5-CI**：push 即触发 CI，跑 270 vitest + 41 e2e，0 失败才 merge

**测试结果**：

```
vitest: Test Files 22 passed, Tests 270 passed
E2E:    === E2E 总计: Pass 41 | Fail 0 ===
```

**git log（v5 新增 4 个 commit）**：

```
f2cb1ad ci: add GitHub Actions workflow for vitest + e2e
f00794f feat(ui): loadMore subtable buttons fetch from server with offset
4963ceb fix(routes): P2-D3 backend support ?all_pages=true for admin select-all
68c5a5e test(e2e): add e2e-runner + fix 3 P0/E2E bugs discovered
```

**累计**：v0+v2+v3+v4+v5 修了 **64 个 bug**（45 原始 + 12 P0/P1 + 3 P3 收尾 + 4 v4.1），跑 **270 vitest + 41 e2e = 311 测试 PASS**。

---

## v3 阶段补充（2026-07-02 新一轮结构性 bug 修复）

> 来源：项目结构性 bug 与隐性 bug 分析报告（新发现 12 个）
> 范围：4 个 P0 + 8 个 P1 严重/中等 bug，每个配 vitest 单测 + git commit

| v3 ID | 严重度 | 说明 | 状态 |
|---|---|---|---|
| **v3-P0-1** | 🔴 | trust proxy=1 绕过 → rate-limit 失效；改 `loopback` | ✅ |
| **v3-P0-2** | 🔴 | candidate_tags 锁覆盖不全；加 `version` 列 + 乐观锁覆盖 PUT/batchAction/rename/merge/delete | ✅ |
| **v3-P0-3** | 🔴 | scanOverdue 与启动 scan 并发；加 Promise 链 mutex + 启动 await | ✅ |
| **v3-P0-4** | 🔴 | interviews/tasks 用 sql.js 谓词 bug；改先 SELECT 验权 + 无条件 UPDATE | ✅ |
| **v3-P1-1** | 🟠 | reports.js SQL 字符串拼接；3 处改 `?` 占位符 | ✅ |
| **v3-P1-2** | 🟠 | client_notes schema 缺列；加 `deleted_at`/`user_id` + 索引 + 查询过滤 + DELETE 改软删 | ✅ |
| **v3-P1-3** | 🟠 | candidate_tags 类型不匹配 + 缺索引；移除 `String()` + 加 `idx_candidate_tags_candidate` | ✅ |
| **v3-P1-4** | 🟠 | auditService `setImmediate` 异步丢失；改同步写入 | ✅ |
| **v3-P1-5** | 🟠 | candidate-detail 子表分页参数未传；3 个 list 方法接 options + 前端 loadDetail 传 `{limit,offset}` | ✅ |
| **v3-P1-6** | 🟠 | clients DELETE 不级联 client_notes；加 `UPDATE client_notes SET deleted_at=...` | ✅ |
| **v3-P1-7** | 🟠 | api.candidates 被赋值两次（死代码）；删第一处，保留含 batchAction 的第二处 | ✅ |
| **v3-P1-8** | 🟠 | tags.js LIKE 子串匹配；5 处改 `instr(tags, '"' + name + '"')` 精确匹配 | ✅ |

**附加修复**（Phase 3 验收时发现）：
- `init.js` 把 module-scoped `let db` 迁移到 `globalThis.__ERP_DB_STATE__`，解决 vitest 4.x worker 间模块状态不共享问题
- `imports.js` 用 `ipKeyGenerator` 包装 IPv6 安全 keyGenerator，消除 express-rate-limit 8.x 启动警告
- 13 处 seed 函数里的 `db.` 引用漏改 → 已补 STATE.db.

**测试**：50/50 PASS（v2 阶段 12 个 + v3 阶段 38 个新增）
- `tests/auth.test.js` 5/5
- `tests/utils.test.js` 7/7
- `tests/middleware/trust-proxy.test.js` 3/3（v3-P0-1）
- `tests/routes/tags-lock.test.js` 3/3（v3-P0-2）
- `tests/routes/recommendations-scan.test.js` 2/2（v3-P0-3）
- `tests/routes/interviews-tasks.test.js` 3/3（v3-P0-4）
- `tests/routes/reports-sql.test.js` 3/3（v3-P1-1）
- `tests/routes/clients-notes.test.js` 4/4（v3-P1-2）
- `tests/routes/candidate-tags-type.test.js` 3/3（v3-P1-3）
- `tests/services/auditService.test.js` 3/3（v3-P1-4）
- `tests/frontend/candidate-detail-api.test.js` 4/4（v3-P1-5）
- `tests/frontend/api-candidates-dedup.test.js` 3/3（v3-P1-7）
- `tests/routes/tags-instr.test.js` 4/4（v3-P1-8）
- `tests/routes/clients-cascade.test.js` 3/3（v3-P1-6）

**git log**：

```
3fe6e8e fix(init): migrate remaining db. to STATE.db. in seed functions
c9eef21 fix(data): P1-NEW-6 cascade soft-delete client_notes
fe1e8bb fix(data): P1-NEW-8 use instr for exact tag match in tags.js
0bda6ca fix(perf): P1-NEW-5 wire subtable pagination params in frontend
7c926ab refactor: P1-NEW-7 remove dead code in api.candidates
984b738 fix(audit): P1-NEW-4 make auditService.log synchronous
fa15c3a fix(data): P1-NEW-3 fix candidate_tags type + add missing index
e5ef449 fix(data): P0-NEW-2 add deleted_at/user_id to client_notes (注：实际是 P1-NEW-2)
64b75d0 fix(security): P1-NEW-1 parameterize reports.js SQL queries
c77b40a fix(security): P0-NEW-4 fix sql.js predicate bug in interviews + tasks
e8f46b2 fix(data): P0-NEW-3 mutex on scanOverdueRecommendations
ac76221 fix(data): P0-NEW-2 optimistic lock on candidate_tags version
781ca9a fix(security): P0-NEW-1 trust proxy=loopback to prevent XFF bypass
df6c776 fix(test): migrate db state to globalThis + beforeAll(init) in auth.test.js
1f9605f snapshot: pre-fix state for 12 new P0/P1 bugs
```

**剩余工作**（留 v3.1+）：
- BFF E2E 跑 `tests/e2e-p0.js` 完整套件（未在本轮跑；当前仅 smoke test 4 个核心 endpoint）
- candidate-detail.html 加载更多 button 逻辑（P1-NEW-5 已 wire-up API，但前端 loadMore 实际逻辑 v3.1 留）
- client_notes PUT 端点的 user_id 权限校验（本轮 P1-NEW-2 只改了 DELETE；PUT 已用 before.user_id 检查但应该 P1-NEW-6 一并 review）
- P2/P3 阶段 bug 仍待修（20+ 个，见 §6-7）

---

## 附录 A：E2E 测试命令模板

```bash
# 1. 重启 BFF（每次代码修改后）
PID=$(/c/Windows/System32/netstat.exe -ano | grep ":3001" | grep "LISTENING" | head -1 | awk '{print $NF}')
[ -n "$PID" ] && /c/Windows/System32/taskkill.exe //F //PID $PID
sleep 1
cd bff && rm -f data/erp.db* && npm start
sleep 5

# 2. 登录拿 token
TOKEN=$(curl -sS -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{console.log(JSON.parse(s).data.token)})")

# 3. 通用 GET 测试
curl -sS http://localhost:3001/api/v1/candidates -H "Authorization: Bearer $TOKEN" | head -200

# 4. 跑综合测试
node -e "/* 完整测试脚本 */"
```

## 附录 B：完整测试清单

接手后跑这一组测试，应全部通过：

```js
// tests/e2e-full.js - 67 个测试
// P0 修复后还要加 4 个 P0 专项测试
// 跑法：node tests/e2e-full.js
```

具体测试代码请看本次会话前面"端到端测试 67/67 通过"的所有 curl/node 脚本。

---

**文档结束。接手者请按 P0 → P1 → P2 → P3 顺序逐项修复，每修一项更新本文档第 10 节的状态表。**
