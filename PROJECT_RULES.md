# PROJECT_RULES.md

> headhunter-erp 项目的硬性约束。任何 AI/开发者在动手前必读。
> 这份文档只写**事实**，不写示例 prompt。

## 变更日志

- 2026-07-01 v1.0 初版

---

## 架构概览

```
浏览器 / AI agent / 兄弟项目
  └─→ http://<host>:3001 (BFF = Express, 纯 API 服务)
        ├─ GET /                 → landing JSON (API metadata)
        ├─ GET /api/docs         → Swagger UI
        ├─ GET /api/v1/openapi.json → OpenAPI 3.0.3 spec
        └─ /api/v1/*             → requireAuth (JWT or API Key smart-detect)
                                      ├─→ better-sqlite3 (./data/erp.db, WAL)
                                      └─→ PLATFORM_API (localhost:3000, 可选)
```

> v9.0-alpha 起，前端 (`pages/`/`shared/`/`partials/`) 迁到 sibling project **headhunter-frontend**。
> 本仓是**纯 API hub**，人类用浏览器需跑 sibling 项目；服务消费者直接调 HTTP。

---

## 1. 服务端口与拓扑

| 服务 | 端口 | 启动命令 | 说明 |
|------|------|----------|------|
| BFF (本项目) | **3001** | `cd bff && npm start` | 纯 API 服务 |
| headhunter-frontend (sibling) | 8080（默认）| `cd ../headhunter-frontend && npm start` | 浏览器 UI，**可选** |
| 平台 API | 3000 | （外部服务）| BFF 通过 `PLATFORM_API_BASE` 调用，本项目**不启动** |

- 根路径 `/` → JSON landing（v9.0-beta 改动，之前是 302 跳前端）
- CORS：`.env` 配 `CORS_ORIGINS`，逗号分隔
- 客户端 API 路径用**完整 base URL**（不像 v9.0 之前用相对路径）
- swagger-ui 在 `/api/docs`

---

## 2. 目录结构（只列常用）

```
headhunter-api-hub/
├── bff/                          # 后端 BFF
│   ├── src/
│   │   ├── index.js              # Express 入口（中间件顺序固定）
│   │   ├── config/env.js         # 环境配置
│   │   ├── db/init.js            # better-sqlite3 + 自动建表 + seed
│   │   ├── middleware/           # auth (JWT+API Key) / permission (role+scope) / errorHandler
│   │   ├── routes/               # 13 route groups (含 openapi + landing)
│   │   ├── services/             # authService / auditService / platformApi / aiMatchingService / importService
│   │   └── utils/                # response / errors / asyncHandler
│   ├── scripts/
│   │   ├── check-fts5.js         # FTS5 可用性检测
│   │   ├── create-api-key.js     # 签发 API Key CLI
│   │   └── generate-openapi.js   # JSDoc → OpenAPI 3.0.3
│   ├── tests/                    # 395 vitest + supertest tests
│   ├── data/erp.db               # SQLite 文件（gitignored）
│   ├── openapi.json              # OpenAPI 3.0.3 spec (generated)
│   └── .env                      # ⚠️ 不要提交 git
└── PROJECT_RULES.md              # 本文件
```

---

## 3. 后端约束

### 3.1 中间件顺序（bff/src/index.js）

固定顺序，**禁止改动**：

```
landing (/)
  → openapi (Swagger UI + openapi.json)
  → helmet
  → cors
  → express.json / urlencoded
  → morgan（dev: 'dev', prod: 'combined', test: 跳过）
  → /api/ 全局限流（rate-limit）
  → /api/v1 路由
  → notFoundHandler
  → errorHandler
```

### 3.2 数据库

- **better-sqlite3**（同步 N-API SQLite，WAL + FK）
- 表结构由 `db/init.js` 自动建，启动时 `CREATE IF NOT EXISTS` / `safeExec ALTER` 兼容老库
- 所有业务表必须有以下字段：`user_id INTEGER`、`deleted_at TEXT`、`created_at TEXT`、`updated_at TEXT`
- 软删除：`UPDATE table SET deleted_at = datetime('now') WHERE ...`
- 查询默认过滤 `deleted_at IS NULL`，admin 可加 `?includeDeleted=true`
- v9.0+: 新增 `api_keys` 表（v9.0-gamma，服务间鉴权）

### 3.3 路由写法（强制）

- 所有 async 路由**优先**用 `asyncHandler` 包裹；裸 `async (req, res, next) => { try {...} catch (err) { next(err); } }` 也允许但更啰嗦，不推荐
- 抛错用 `utils/errors.js` 的工厂函数：`notFound(msg)`、`badRequest(msg)`、`forbidden(msg)`
- 成功响应：`res.json(success(data))` 或 `res.json(pagination(rows, total, page, pageSize))`
- 所有业务路由文件**顶部必须**挂 `router.use(requireAuth)`
- admin 跨用户访问：`if (req.user.role === 'admin') { ... }` 跳过 user_id 过滤
- 写操作（POST/PUT/DELETE）必须调 `auditService.log(...)`

### 3.4 统一响应协议

**成功**：

```json
{ "ok": true, "data": {...}, "meta": { "total": 13, "page": 1, "pageSize": 20, "hasMore": false } }
```

**失败**：

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "任务不存在" } }
```

### 3.5 错误码（utils/errors.js）

| code | HTTP | 含义 |
|------|------|------|
| NO_TOKEN | 401 | 未登录 |
| INVALID_TOKEN | 401 | token 过期或无效 |
| UNAUTHORIZED | 401 | 认证失败 |
| FORBIDDEN | 403 | 无权限 |
| NOT_FOUND | 404 | 资源不存在 |
| VALIDATION_ERROR | 400 | 参数错误 |
| DUPLICATE / CONFLICT | 409 | 数据冲突 |
| RATE_LIMITED | 429 | 限流 |
| INTERNAL_ERROR | 500 | 服务器错误 |

### 3.6 认证

- JWT 默认 7 天过期，secret 从 `JWT_SECRET` 读，**禁止**硬编码
- 密码 bcrypt 10 rounds
- 默认账号 `admin/admin123`、`demo/demo123`（**仅 `DEMO_SEED=true` 且 users 表为空时**）
- 登录接口限流：15 分钟 10 次
- 全局限流：1 分钟 200 次（仅 `/api/` 前缀）

---

## 4. 前端约束

> **v9.0-alpha 起，前端迁到 sibling 项目 [`headhunter-frontend`](https://github.com/qing3a/headhunter-frontend)**。
> 本仓不再有 `pages/`、`shared/`、`partials/`、`assets/`。前端约束详见 sibling 仓库的 `PROJECT_RULES.md`。

如需修改前端规则：

- 改 sibling 项目的 PROJECT_RULES.md
- 或 PR 到 sibling 项目加新约束

---

## 5. 设计规范

> 同 §4，前端样式迁到 sibling 项目。API hub 不再涉及 UI 设计。

```css
--font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
```

### 5.3 外部依赖最小化

- Tailwind CSS 浏览器版（cdn.jsdelivr.net）目前保留，但**生产部署前必须本地化**
- 不要引入新的外部 CDN 资源

---

## 6. 安全与合规

- `.env` 永远不提交 git
- `JWT_SECRET` 生产环境必须替换为 32+ 字符随机串
- `DEMO_SEED` 生产环境必须设为 `false`
- bcrypt rounds = 10，禁止降低
- 所有用户输入必须经过校验（`utils/errors.badRequest`）

---

## 7. AI 协作约定

1. **先读这份文档**，再动手
2. **小改直接做**：partial 微调、CSS 调整、单文件 bug → 不需要写 prompt，直接 IDE 操作
3. **中改要列影响面**：改一个文件前，先用 Grep/Read 列出会受影响的其他文件
4. **大改必须人定义契约**：新 API、新页面、新数据模型 → 由人写接口规范，AI 按规范实现
5. **AI 禁止改动的文件**：`package.json` 依赖、`bff/.env`、`data/*.db`（除非明确要求）

---

## 8. 已知问题与待办

| 项 | 状态 | 说明 |
|---|---|---|
| Tailwind CSS CDN 本地化 | 待办 | 生产前必须 |
| `data-kpi` 字段映射 | OK | dashboard.html 优先读 `stats.total_clients`，缺失才 fallback 到 `total_recommendations` |
| `register.html` 调私有方法 `_request` | 待优化 | API 已有 `API.auth.register()` 公共方法，register.html 未迁移 |
| 单元测试 | 缺 | 建议补 vitest / jest |
| `audit-log` 接口 admin 可查，前端无页面 | 待补 | |

---

## 9. 速查命令

```bash
# 启动
cd bff && npm start
# 访问
http://localhost:3001/

# 重置数据库（删除旧文件，下次启动会自动建表 + seed）
rm bff/data/erp.db*

# 杀占用 3001 的进程
powershell -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"

# 跑 curl 冒烟测试（登录）
curl -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
```