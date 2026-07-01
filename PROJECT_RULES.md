# PROJECT_RULES.md

> headhunter-erp 项目的硬性约束。任何 AI/开发者在动手前必读。
> 这份文档只写**事实**，不写示例 prompt。

## 变更日志

- 2026-07-01 v1.0 初版

---

## 架构概览

```
浏览器
  └─→ http://localhost:3001 (BFF = Express)
        ├─ /pages/*      → express.static(项目 pages/)
        ├─ /shared/*     → express.static(项目 shared/)
        ├─ /partials/*   → express.static(项目 partials/)
        └─ /api/v1/*     → requireAuth → 业务路由
                              ├─→ sql.js (内存 SQLite, ./data/erp.db)
                              └─→ PLATFORM_API (localhost:3000, 仅 jobs 模块)
```

---

## 1. 服务端口与拓扑

| 服务 | 端口 | 启动命令 | 说明 |
|------|------|----------|------|
| BFF + 静态前端 | **3001** | `cd bff && npm start` | 同源部署，BFF 自己托管 `/pages`、`/shared`、`/partials` |
| 平台 API | 3000 | （外部服务）| BFF 通过 `PLATFORM_API_BASE` 调用，本项目**不启动** |

- 根路径 `/` → 302 跳 `/pages/dashboard.html`
- 不要起 5500 / 8080 等额外静态服务器（会跨域）
- 前端 API 路径用**相对路径** `/api/v1`，**禁止**写 `http://localhost:3001`

---

## 2. 目录结构（只列常用）

```
headhunter-erp/
├── bff/                          # 后端 BFF
│   ├── src/
│   │   ├── index.js              # Express 入口（中间件顺序固定）
│   │   ├── config/env.js         # 环境配置
│   │   ├── db/init.js            # sql.js + 自动建表 + seed
│   │   ├── middleware/           # auth / permission / errorHandler
│   │   ├── routes/               # auth / dashboard / candidates / jobs / interviews / tasks / clients
│   │   ├── services/             # authService / auditService / platformApi
│   │   └── utils/                # response / errors / asyncHandler
│   ├── data/erp.db               # SQLite 文件（建议加进 .gitignore）
│   └── .env                      # ⚠️ 不要提交 git
├── pages/                        # 前端页面（HTML）
├── partials/project-shell.html   # 布局壳（侧边栏 + 顶栏）
├── shared/                       # 前端共享 JS/CSS
│   ├── auth.js / loading.js / router.js / api.js
│   ├── layout.js                 # 加载 partial + 路由守卫 + 用户信息填充
│   ├── shared.css                # 主题变量 + 组件样式
│   └── storage.js / shared.js
└── PROJECT_RULES.md              # 本文件
```

---

## 3. 后端约束

### 3.1 中间件顺序（bff/src/index.js）

固定顺序，**禁止改动**：

```
express.static(/shared, /partials, /pages)
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

- 使用 `sql.js`（内存版 SQLite），**禁止**引入 better-sqlite3 / node:sqlite
- 表结构由 `db/init.js` 自动建，启动时 ALTER 兼容老库
- 所有业务表必须有以下字段：`user_id INTEGER`、`deleted_at TEXT`、`created_at TEXT`、`updated_at TEXT`
- 软删除：`UPDATE table SET deleted_at = datetime('now') WHERE ...`
- 查询默认过滤 `deleted_at IS NULL`，admin 可加 `?includeDeleted=true`

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

### 4.1 页面通用结构

每个页面 `<head>` 必须包含：

```html
<link rel="stylesheet" href="../shared/shared.css">
<script src="../shared/auth.js"></script>
<script src="../shared/loading.js"></script>
<script src="../shared/router.js"></script>
<script src="../shared/api.js"></script>
<script src="../shared/shared.js"></script>
<script src="../shared/layout.js"></script>
```

`auth.js → loading.js → router.js → api.js → shared.js → layout.js` **顺序固定**，不能调换。

页面 body 顶层 `<div id="pageContent">`，CSS 用 `<style id="pageStyle">`，脚本用 `<script id="pageScript">`（layout.js 会搬运到正确位置）。

### 4.2 共享工具（window.*）

| 工具 | 用途 | 关键 API |
|------|------|----------|
| `Auth` | 登录态 | `getToken/getUser/setSession/clear/logout/requireLogin/isAdmin/hasRole` |
| `Router` | 路由跳转 | `go(name) / navigate(path) / getParam(name) / current()` |
| `Loading` | 全屏 loading | `show() / hide() / forceHide()`（带引用计数） |
| `API` | 后端调用 | `API.tasks/jobs/interviews/candidates/clients/dashboard/auth` |

### 4.3 API 调用规则

- **始终**通过 `window.API.xxx.yyy()` 调用，**禁止**直接 `fetch`
- 列表接口返回 `{ok:true, data:[], meta:{total,page,pageSize,hasMore}}`
- `API.tasks.list()` 等命名空间方法通过**闭包变量 `api`** 访问 `_request` / `_unwrap`，**不要用 `this`**（历史踩坑：prototype 嵌套对象字面量里 `this` 指向子对象而不是 ApiClient 实例，会找不到 `_request`）
- 401 时 `API._request` 自动调 `Auth.logout()` 跳 login，**不要在调用方重复处理**
- 错误提示用 `UI.showToast` 或 `Toast.error`，**不要**直接 `alert`

### 4.4 DOM 钩子（partial/layout.js 约定）

修改 `partials/project-shell.html` 时，同步改 `shared/layout.js` 的 `fillUserInfo()`。

当前钩子清单：

| `data-dom-id` | 用途 | 填充字段 |
|---|---|---|
| `sidebar-user-name` | sidebar 底部用户名 | `displayName \|\| username` |
| `sidebar-user-role` | sidebar 底部角色 | 中文角色标签 |
| `dropdown-user-name` | 右上角 dropdown 名字 | 同上 |
| `dropdown-user-role` | 右上角 dropdown 角色 | `角色 · username` |
| `logout-btn` | 登出按钮 | 点击 → `Auth.logout()` |

**新增钩子必须三处同步**：partial HTML + layout.js 选择器 + data-dom-id 约定。

### 4.5 element 绑定写法

DOMContentLoaded 里绑事件**必须用 null-safe 模式**：

```js
function on(id, evt, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evt, handler);
}

on('saveBtn', 'click', saveHandler);
```

**禁止**：

```js
document.getElementById('saveBtn').addEventListener('click', saveHandler);
// TypeError: Cannot read properties of null
```

---

## 5. 设计规范

### 5.1 配色（CSS 变量）

主色：`#0D9488` (--color-primary)
辅助：`#14B8A6` (light) / `#5EEAD4` (lighter) / `#CCFBF1` (lightest) / `#0F766E` (dark)

### 5.2 字体

**禁止**使用 Google Fonts / 任何外部字体 CDN。统一：

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