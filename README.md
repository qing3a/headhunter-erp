# headhunter-api-hub

[![test](https://github.com/qing3a/headhunter-erp/actions/workflows/test.yml/badge.svg)](https://github.com/qing3a/headhunter-erp/actions/workflows/test.yml)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0-blue)](https://github.com/qing3a/headhunter-erp/tree/main/bff/openapi.json)
[![License](https://img.shields.io/badge/license-Internal-red)]()

> 猎头公司数据 API hub — 60 endpoints 覆盖候选人 / 职位 / 推荐 / 客户 / 标签 / 报表 / AI 匹配
> 让 AI agent / 兄弟项目通过 HTTP 消费统一数据源

## 这是什么

本项目是 v9.0 大改造后的 **headhunter-api-hub**：纯 API 服务，不再内置前端。
- 所有 60 个端点暴露在 `http://<host>:3001/api/v1`
- 同时支持 **JWT**（人类用户）和 **API Key**（服务间）两种鉴权
- 完整 **OpenAPI 3.0.3** 规范 + Swagger UI 浏览器可试调
- 67 个 bug 已修，395 个 vitest + 144 个 e2e 测试全绿

如果你是**人类用户**想用浏览器看数据，请到 sibling 项目 **[headhunter-frontend](https://github.com/qing3a/headhunter-frontend)**（独立仓库）。

如果你是 **AI agent / 兄弟项目 / 自动化客户端**，请继续阅读本文。

## 快速开始

```bash
# 1. 克隆 + 安装
git clone https://github.com/qing3a/headhunter-api-hub.git
cd headhunter-api-hub/bff
npm install

# 2. 复制环境变量
cp .env.example .env
# 编辑 .env 设置 JWT_SECRET (>=16 字符) 和 CORS_ORIGINS

# 3. 启动（首次自动建表 + seed demo 数据）
npm start
# 输出：
#   🚀 ERP BFF running on http://localhost:3001
#   📊 API base: http://localhost:3001/api/v1

# 4. 浏览器打开 Swagger UI 试调
open http://localhost:3001/api/docs
```

## 鉴权两种方式

### 1️⃣ JWT（人类用户，浏览器登录）

```bash
# 登录拿 token
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 用 token 调 API
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/v1/candidates
```

默认账号（仅 dev）:
- `admin` / `admin123` （超级管理员）
- `demo` / `demo123` （普通顾问）

### 2️⃣ API Key（服务消费者，AI agent / 兄弟项目）

```bash
# 一次性签发（明文 key 只显示这一次！）
node scripts/create-api-key.js "my-ai-agent" --scopes "read:candidates,read:jobs"

# 输出示例：
#   key (plain) : hha_Cls3OYsU3DXJK5DaZYLv05B8q08v-wm-c9nnvL4IL5s

# 用 key 调 API
curl -H "Authorization: ApiKey hha_Cls3OYsU3DXJK5DaZYLv05B8q08v-wm-c9nnvL4IL5s" \
  http://localhost:3001/api/v1/candidates
```

**Scopes**（可选）：`read:candidates` / `write:candidates` / `read:jobs` / `*`（通配）。空 scopes = 通配。

详细协作流程见 [INTEGRATION.md](./INTEGRATION.md)。

## API 概览

| 端点 | 说明 |
|---|---|
| `POST /api/v1/auth/login` | 登录拿 JWT |
| `GET /api/v1/auth/me` | 当前用户信息 |
| `POST /api/v1/auth/change-password` | 改密（撤销所有旧 token） |
| `GET/POST /api/v1/candidates` | 候选人列表 / 创建 |
| `GET/PUT/DELETE /api/v1/candidates/:id` | 候选人详情 / 更新 / 软删（级联子表） |
| `GET/POST /api/v1/candidates/:id/experiences` | 工作经历 |
| `GET/POST /api/v1/candidates/:id/educations` | 教育背景 |
| `GET/POST /api/v1/candidates/:id/contacts` | 联系记录 |
| `GET/POST/PUT/DELETE /api/v1/jobs` | 职位 CRUD |
| `GET /api/v1/jobs/lookup` | 职位下拉（用于推荐表单） |
| `POST /api/v1/jobs/sync-from-platform` | 从外部平台同步（admin） |
| `GET/POST /api/v1/recommendations` | 推荐列表 / 创建 |
| `POST /api/v1/recommendations/:id/status` | 状态机推进（7 态） |
| `GET /api/v1/recommendations/overdue` | 过期待跟进 |
| `POST /api/v1/recommendations/scan-overdue` | 手动扫描 overdue |
| `GET/POST/PUT/DELETE /api/v1/clients` | 客户 CRUD |
| `* /api/v1/clients/:id/notes` | 客户备注 |
| `GET /api/v1/tags` | 所有 tag + count |
| `PUT /api/v1/tags/:tag/rename` | 改 tag |
| `POST /api/v1/tags/merge` | 合并 tag（admin） |
| `GET /api/v1/reports/kpi` | KPI 仪表盘 |
| `GET /api/v1/reports/funnel` | 招聘漏斗 |
| `GET /api/v1/reports/consultant-performance` | 顾问 Top |
| `GET /api/v1/reports/status-distribution` | 状态分布 |
| `GET /api/v1/imports/template` | 下载 Excel 模板 |
| `POST /api/v1/imports/preview` | 预览 + 字段映射 |
| `POST /api/v1/imports/commit` | 提交导入 |
| `POST /api/v1/ai-matching/candidate/:id/match` | AI 匹配候选人→职位 |
| `POST /api/v1/ai-matching/job/:id/match` | AI 匹配职位→候选人 |

完整 60 端点见 [API.md](./API.md) 或 `http://localhost:3001/api/docs`。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js 22+ + Express 4.18 |
| 数据库 | better-sqlite3 (同步 N-API, WAL + FK) |
| 搜索 | SQLite FTS5 (内置, fallback LIKE) |
| 认证 | JWT (jsonwebtoken) + bcryptjs |
| 安全 | helmet + cors + express-rate-limit |
| 测试 | vitest 4.x + supertest + happy-dom |
| OpenAPI | 自研 JSDoc → OpenAPI 3.0.3 生成器 |
| UI 文档 | Swagger UI 5 (CDN) |

## 目录结构

```
headhunter-api-hub/
├── bff/
│   ├── src/
│   │   ├── index.js              # Express 入口 (静态 serving 已删除)
│   │   ├── config/env.js         # 环境配置
│   │   ├── db/init.js            # sql.js / better-sqlite3 + 10+ 表 + seed
│   │   ├── middleware/           # auth (JWT+API Key smart) / permission (scope) / errorHandler
│   │   ├── routes/               # 13 route groups (含 openapi + landing)
│   │   ├── services/             # 业务逻辑
│   │   └── utils/                # 响应 / 错误码 / 异步包装
│   ├── scripts/
│   │   ├── check-fts5.js         # FTS5 可用性检查 (CI 用)
│   │   ├── create-api-key.js     # 签发 API Key CLI
│   │   └── generate-openapi.js   # JSDoc → OpenAPI 3.0.3 生成器
│   ├── tests/                    # 395 vitest tests
│   ├── data/erp.db               # SQLite 文件 (gitignored)
│   ├── openapi.json              # generated OpenAPI 3.0.3 spec
│   └── package.json
├── docs/                         # 设计 / 升级 / 迁移文档
├── .github/workflows/            # GitHub Actions CI
├── README.md                     # 本文件
├── API.md                        # 完整 REST API 文档
├── INTEGRATION.md                # 集成指南（AI agent / 兄弟项目）
├── DEPLOYMENT.md                 # 部署指南
├── BUGFIX_PLAN.md                # 67 bug 修复历史
├── PROJECT_RULES.md              # 项目硬性约束
├── CONTRIBUTING.md               # 贡献指南
└── LICENSE                       # 许可证
```

## 协作模式

```
┌─────────────────┐     HTTP/JSON     ┌──────────────────────┐
│  AI Agent       │ ───────────────→ │                      │
│  (Claude/Cursor)│                  │                      │
└─────────────────┘                  │                      │
                                     │   headhunter-api-hub  │
┌─────────────────┐                  │   (本仓)              │
│  headhunter-    │ ───────────────→ │                      │
│  frontend       │                  │   - JWT or API Key    │
│  (兄弟项目)     │                  │   - 60 endpoints      │
└─────────────────┘                  │   - OpenAPI 3.0.3    │
                                     │   - Swagger UI       │
┌─────────────────┐                  │                      │
│  ow-headhunter- │ ───────────────→ │                      │
│  erp (单机 ERP) │                  │                      │
└─────────────────┘                  └──────────────────────┘
```

## 测试

```bash
# 单元 + 集成 (vitest + supertest, 395 tests)
cd bff && npm test

# 端到端 (BFF 启停 + 144 tests)
cd bff && npm run e2e

# 全部
cd bff && npm run test:all

# 覆盖率
cd bff && npm run test:coverage

# OpenAPI spec 一致性 (CI 用)
cd bff && npm run openapi:check
```

## 部署

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)。生产推荐 pm2 + nginx 反向代理。Docker 化是 v9.1 待办。

## 集成

详见 [INTEGRATION.md](./INTEGRATION.md)：JWT/API Key 获取、curl / Python / JS 示例、错误处理、最佳实践。

## 文档

| 文档 | 说明 |
|---|---|
| [README.md](./README.md) | 本文件 — 项目介绍 + 快速开始 |
| [API.md](./API.md) | 完整 REST API 文档（按 endpoint） |
| [INTEGRATION.md](./INTEGRATION.md) | 协作者接入指南（AI agent / 兄弟项目） |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 生产部署指南（pm2 / nginx / env） |
| [BUGFIX_PLAN.md](./BUGFIX_PLAN.md) | 67 bug 修复历史（v0 → v9） |
| [PROJECT_RULES.md](./PROJECT_RULES.md) | 项目硬性约束（架构 / 安全 / 命名 / 风格） |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 贡献指南（PR 工作流 / 编码规范 / 测试要求） |
| `http://localhost:3001/api/docs` | Swagger UI（交互式） |
| `bff/openapi.json` | OpenAPI 3.0.3 规范（机器可读） |

## 默认账号（仅 dev / demo）

| 账号 | 密码 | 角色 | 说明 |
|---|---|---|---|
| `admin` | `admin123` | admin | 看全部 / 管理 / 删 |
| `demo` | `demo123` | consultant | 只看自己创建的候选人 / 推荐 |

生产环境务必修改密码（[DEPLOYMENT.md](./DEPLOYMENT.md) 有说明）。

## 已知限制

- **单进程**：better-sqlite3 单连接（WAL 允许多读单写），**无水平扩展**
- **rate limit**：login 10/15min，import 10/hour（per IP）
- **JWT 7 天过期**，无 refresh token
- **无多租户**：`tenant_id` 列不存在，单租户架构
- **无 WebSocket / SSE**：实时通知靠客户端 polling

## 路线图（v9.1+）

- Docker / docker-compose
- 多租户 (`tenant_id` 列)
- 真实 ML 匹配（向量 / LLM 重排）
- WebSocket 实时推送
- i18n / 多语言

## License

Internal use only. 详见 [LICENSE](./LICENSE)。

## 联系方式

- Issues: GitHub Issues
- Maintainer: qing3a