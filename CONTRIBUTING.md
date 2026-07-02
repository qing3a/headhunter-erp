# Contributing

## 开发环境

- Node.js 22+
- npm 9+
- Git
- Windows / macOS / Linux 都行

## 工作流

1. **Fork + clone** 仓库
2. **建分支**：`git checkout -b feature/your-feature-name` 或 `fix/bug-desc`
3. **改代码**（commit message 简短清晰：`<type>(<scope>): <description>`）
4. **跑测试**：`cd bff && npm test && npm run e2e`
5. **push**：`git push origin feature/your-feature-name`
6. **开 PR**：用 `.github/PULL_REQUEST_TEMPLATE.md` 模板
7. **CI 自动跑**：vitest + e2e 全过才合
8. **maintainer review + merge**

## 目录约定

- `bff/src/` —— BFF 路由 / 服务 / DB
- `bff/tests/` —— vitest 单测（`*.test.js`）
- `shared/` —— 前端共享代码
- `pages/` —— 前端 18 个 page
- `partials/` —— partial HTML（project-shell）
- `docs/` —— 文档

## 代码风格

- 后端：asyncHandler 包裹、try-catch 异常
- 前端：escapeHtml 防 XSS、不直接用 innerHTML 拼用户输入
- DB：safeExec ALTER、用占位符 `?` 而非字符串拼接
- commit 前缀：`fix(security):` / `feat(ui):` / `test(routes):` / `docs:` / `refactor:` / `ci:`

## 测试要求

- P0/P1 修复必加专项 E2E
- vitest 单测覆盖核心 SQL 行为 + 源码 invariant
- E2E 跑前确保 BFF 已 build：`cd bff && npm install`

## 不要做

- 不要删别人代码（先在 PR 讨论）
- 不要直接 push 到 main
- 不要引入新依赖而不讨论
- 不要把 PII / 真实数据 commit 进来
