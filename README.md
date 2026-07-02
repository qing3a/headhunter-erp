# headhunter-erp

[![test](https://github.com/qing3a/headhunter-erp/actions/workflows/test.yml/badge.svg)](https://github.com/qing3a/headhunter-erp/actions/workflows/test.yml)

> 猎头公司 ERP 系统（候选人 / 职位 / 推荐 / 客户 / 标签 / 报表）

## 项目简介

本系统是猎头公司的核心业务系统，覆盖：

- **候选人档案**（基本信息 / 工作经历 / 教育背景 / 联系记录 / 推荐记录 / 时间线）
- **职位管理**（CRUD / 状态 / 同步远端）
- **推荐记录**（创建 / 状态流转 7 状态 / 历史 / 自动过期扫描）
- **客户管理**（CRUD / 备注 / 关联）
- **标签管理**（列表 / 改名 / 合并 / 删除 / 并发保护）
- **报表**（KPI / 招聘漏斗 / 顾问 Top 5 / 状态分布）
- **AI 智能匹配**（6 维加权评分 / 一键推荐）
- **Excel 导入**（拖拽 / 字段映射 / 去重 / 报告）
- **批量操作**（打标签 / 改状态 / 删除 / 全选所有页）
- **自动提醒**（BFF 启动扫描 overdue 推荐）

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express 4.18 + sql.js（内存 SQLite）|
| 认证 | JWT（jsonwebtoken）+ bcryptjs（rounds=10）|
| 安全 | helmet + cors + express-rate-limit |
| 文件 | multer（multer.memoryStorage）+ exceljs |
| 前端 | 原生 HTML + JS + CSS（无构建工具）|
| 主题 | teal 系（--color-primary: #0D9488）|

## 目录结构

```
headhunter-erp/
├── bff/                           # 后端
│   ├── src/
│   │   ├── index.js              # Express 入口
│   │   ├── config/env.js         # 环境配置
│   │   ├── db/init.js             # sql.js + 自动建表 + seed
│   │   ├── middleware/           # auth / permission / errorHandler
│   │   ├── routes/               # 业务路由
│   │   │   ├── auth.js           # 登录 / 注册 / 改密
│   │   │   ├── users.js          # 用户 CRUD（隐式）
│   │   │   ├── candidates.js     # 候选人 + 3 子表
│   │   │   ├── jobs.js           # 职位 CRUD
│   │   │   ├── recommendations.js # 推荐记录 + 状态流转
│   │   │   ├── clients.js        # 客户 + 备注
│   │   │   ├── tags.js           # 标签管理
│   │   │   ├── reports.js        # 报表
│   │   │   └── imports.js        # Excel 导入
│   │   ├── services/             # 业务逻辑
│   │   │   ├── authService.js
│   │   │   ├── auditService.js
│   │   │   ├── importService.js
│   │   │   └── platformApi.js
│   │   └── utils/                # 响应 / 错误码 / 异步包装
│   ├── data/erp.db              # SQLite 文件（首次启动自动创建）
│   └── package.json
├── pages/                         # 前端页面
├── shared/                        # 共享 JS / CSS
├── partials/                      # 布局模板
├── tests/                         # E2E 测试
└── PROJECT_RULES.md               # 硬性约束
```

## 快速开始

```bash
# 1. 安装依赖
cd bff && npm install

# 2. 启动 BFF（首次启动自动建表 + seed demo 数据）
npm start
# 输出：
#   🚀 ERP BFF running on http://localhost:3001
#   ⏰ Reminder scan: 0 overdue (all clear)

# 3. 浏览器打开
#   http://localhost:3001/
#   自动跳转到 /pages/dashboard.html

# 4. 登录
#   admin / admin123   （超级管理员）
#   demo  / demo123    （普通顾问）
```

⚠️ **必须从 `http://localhost:3001/` 进入**（同源架构，file:// 协议不工作）

## 配置

复制 `.env.example` 到 `.env` 并按需修改：

```bash
PORT=3001                              # BFF 端口
NODE_ENV=development                   # dev / production
JWT_SECRET=...                         # 必须 ≥ 16 字符
JWT_EXPIRES_IN=7d
DEMO_SEED=true                         # 是否 seed demo 数据
CORS_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
REMINDER_SCAN=true                     # 启动时扫描 overdue 推荐
AUDIT_RETENTION_DAYS=90                # audit_log 保留天数
PLATFORM_API_BASE=                     # 远端 PLATFORM_API（可选）
```

## API 概览

详细见 [API.md](./API.md)。核心端点：

```
POST   /api/v1/auth/login              登录
POST   /api/v1/auth/logout             登出
POST   /api/v1/auth/change-password    改密
POST   /api/v1/auth/register           创建用户（admin）

GET    /api/v1/candidates              列表（筛选 / 排序 / 分页）
POST   /api/v1/candidates              创建
GET    /api/v1/candidates/:id          详情（含 3 子表 + 推荐）
PUT    /api/v1/candidates/:id          更新
DELETE /api/v1/candidates/:id          软删除
POST   /api/v1/candidates/batch         批量（tag / untag / status / delete）
POST   /api/v1/candidates/import/...   Excel 导入

GET    /api/v1/jobs                     列表
POST   /api/v1/jobs                     创建
GET    /api/v1/jobs/:id                 详情
PUT    /api/v1/jobs/:id                 更新
DELETE /api/v1/jobs/:id                 软删除
GET    /api/v1/jobs/lookup              下拉
GET    /api/v1/jobs/sync-from-platform  同步远端

GET    /api/v1/recommendations          列表
POST   /api/v1/recommendations          创建
POST   /api/v1/recommendations/:id/status  状态流转
GET    /api/v1/recommendations/overdue  过期待跟进
POST   /api/v1/recommendations/scan-overdue  手动扫描

GET    /api/v1/clients                  列表
POST   /api/v1/clients                  创建
GET    /api/v1/clients/:id              详情
PUT    /api/v1/clients/:id              更新
DELETE /api/v1/clients/:id              软删除
GET    /api/v1/clients/lookup           下拉
*       /api/v1/clients/:id/notes       备注 CRUD

GET    /api/v1/tags                     列出所有 tag
PUT    /api/v1/tags/:tag/rename        改名
DELETE /api/v1/tags/:tag               删除
POST   /api/v1/tags/merge              合并

GET    /api/v1/reports/kpi             KPI
GET    /api/v1/reports/funnel          漏斗
GET    /api/v1/reports/consultant-performance  顾问 Top
GET    /api/v1/reports/status-distribution    状态分布

GET    /api/v1/imports/template        下载模板
POST   /api/v1/imports/preview         预览 + 字段映射
POST   /api/v1/imports/commit          提交导入
```

## 测试

```bash
# E2E（端到端，Node 脚本 + HTTP）
cd bff
node test_p2v.js

# 当前覆盖：基础功能 + P0/P1/P2 专项 + 跨用户隔离
```

## 文档

| 文档 | 说明 |
|---|---|
| [PROJECT_RULES.md](./PROJECT_RULES.md) | 项目硬性约束（所有代码必须遵守）|
| [API.md](./API.md) | 完整 API 端点文档 |
| [BUGFIX_PLAN.md](./BUGFIX_PLAN.md) | 45 个 bug 修复计划与状态 |

## 数据库

sql.js 是纯 JS 实现的 SQLite，**数据存内存 + 文件持久化**：

- **首次启动**：自动创建表（10+ 张）+ 索引 + seed 5 个 demo 候选人 + 5 个 demo 职位
- **数据目录**：`bff/data/erp.db`（建议加 .gitignore）
- **重置数据**：删 `bff/data/erp.db*` + 重启

主要表：

| 表 | 用途 |
|---|---|
| `users` | 用户（admin / consultant）|
| `candidates` | 候选人主表（含 13 个业务字段）|
| `candidate_experiences` | 工作经历 |
| `candidate_educations` | 教育背景 |
| `candidate_contacts` | 联系记录 |
| `candidate_tags` | tag（JSON 数组）|
| `jobs` | 职位 |
| `recommendations` | 推荐记录（含 7 状态机）|
| `recommendation_status_history` | 状态变更历史 |
| `clients` | 客户 |
| `client_notes` | 客户备注 |
| `interviews` | 面试 |
| `tasks` | 任务 |
| `audit_log` | 写操作审计 |

## 软删除

**所有表都支持软删除**（`deleted_at` 字段）。admin 可 `?includeDeleted=true` 查所有。用户只能看自己的数据。

## 已知问题

详见 [BUGFIX_PLAN.md](./BUGFIX_PLAN.md)。当前完成 **23/45**：

- ✅ P0 严重 4 个
- ✅ P1 中等 6 个
- ✅ P2 低级 13 个
- ⬜ P3 杂项 22 个

## 部署

```bash
# 1. 生产环境
NODE_ENV=production
JWT_SECRET=<32+ 字符随机>
DEMO_SEED=false
CORS_ORIGINS=https://yourdomain.com
REMINDER_SCAN=true  # 启动时扫描

# 2. 反向代理（Nginx）
# location / { proxy_pass http://localhost:3001; }
# 启用 HTTPS（推荐）

# 3. 数据备份
# 定期备份 bff/data/erp.db
```

⚠️ **不要用 `file://` 直接打开 HTML**——必须通过 BFF（同源架构）

## License

Internal use only.

## 联系方式

项目维护：[项目维护者]
问题反馈：开 Issue 或联系维护者

## PR 工作流

本项目用 GitHub Flow：

1. 从 `main` 拉新分支：`git checkout -b feature/xxx`
2. 提交 + push：`git push -u origin feature/xxx`
3. 开 PR：用 `.github/PULL_REQUEST_TEMPLATE.md` 模板
4. CI 自动跑（vitest + E2E）：[![](https://github.com/qing3a/headhunter-erp/actions/workflows/test.yml/badge.svg)](https://github.com/qing3a/headhunter-erp/actions/workflows/test.yml)
5. Review + merge 到 `main`
6. 详见 `CONTRIBUTING.md`

## Development

### 依赖

| 工具 | 版本 | 用途 |
|---|---|---|
| Node.js | 22.x | CI / 本地运行（`.github/workflows/test.yml`）|
| npm | 随 Node | 装依赖 |
| Chrome / Edge | 任意 | 手动验证前端 |

### 首次运行

```bash
cd bff
npm install     # 装依赖
npm start       # 默认监听 3001，首次启动自动建表 + seed
```

启动后会自动创建 `bff/data/erp.db`、建表 + 索引、写入 demo seed：
**5 candidates + 5 jobs + 6 tasks + 3 interviews**。

### 跑测试

| 类型 | 命令 | 用例数 | 前置条件 |
|---|---|---|---|
| vitest 单测 | `cd bff && npm test` | 270 | 无 |
| E2E 脚本 | `cd bff && npm run e2e` | 40+ | BFF 启在 3001 |

### CI

push 到 `main` 触发 GitHub Actions（`.github/workflows/test.yml`）：

[![test](https://github.com/qing3a/headhunter-erp/actions/workflows/test.yml/badge.svg)](https://github.com/qing3a/headhunter-erp/actions/workflows/test.yml)

### 数据库

BFF 用 **sql.js**（纯 JS SQLite，内存 + 文件持久化）：

- 首次启动自动建表 + 索引
- 文件落地在 `bff/data/erp.db`
- 重置：删 `bff/data/erp.db*` + 重启
- 不支持并发写（单连接）

### 默认账号

| 账号 | 密码 | 权限 |
|---|---|---|
| `admin` | `admin123` | 看全部 / 管理 / 删 |
| `demo` | `demo123` | 只看自己创建的候选人 / 推荐 |

### E2E runner 原理（`bff/tests/e2e-runner.js`）

- **每个脚本前重启 BFF**：避免 rate-limit 累积 + 状态污染
- **drain BFF stdout**：避免 morgan 日志 pipe 阻塞导致 BFF 卡死
- **脚本间 sleep 1.5s**：避免 `tokens_invalidated_after` 同秒竞态（JWT 撤销时间戳精度为 1s）

### 已知限制

- **单进程 / 单连接**：BFF 单进程、sql.js 单连接，**无水平扩展**，不适合高并发生产
- **rate-limit**：`/auth/login` 10/15min，`/candidates/import/*` 10/hour（IP 级）
- **候选人池搜索**：`LIKE %k%` 走全表扫，>1k 候选人时明显变慢；建议加 FTS5 索引
- **morgan 日志**：必须 drain stdout，否则 pipe 满后 BFF 阻塞
