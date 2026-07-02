# FTS5 全文搜索升级路径

## 背景

候选人池的 `?keyword=` 查询当前用 `LIKE %k%` 全表扫描。v6.5 试过 sql.js FTS5 失败（`no such module: fts5`），已自动降级到 LIKE 路径 + 复合索引兜底。

本文档分析 3 种升级路径，**等 sql.js 出 FTS5-enabled WASM build 后零代码激活**。

## 现状

| 维度 | 值 |
|---|---|
| sql.js 版本 | 1.14.1 |
| FTS5 支持 | ❌ WASM build 不含 fts5 模块 |
| 关键词查询 | LIKE %k% 全表扫（>1k 候选人时变慢） |
| 索引兜底 | `idx_candidates_name/phone/email`（B-tree） |
| 代码开关 | `globalThis.__FTS_AVAILABLE__` 标志（v6.5 加） |

## 路径 A：等 sql.js 2.x（含 FTS5）

**预计**：无 ETA（sql.js 维护缓慢）

**优点**：
- 零代码改动 — `init.js` 检测 `__FTS_AVAILABLE__` 自动激活
- 现存 FTS5 triggers + candidates.js 改造（v6.5）已就绪
- 风险最低

**缺点**：
- 不知道什么时候出
- 升级可能 breaking（API 变化）

**验收**：
- 升级 `bff/package.json` 依赖到 `^2.0.0`
- 跑 `bff/tests/routes/candidates-fts.test.js` 8 个 case 全过
- 跑 `bff/tests/performance/*.test.js` 1000 候选 + keyword 查询 < 50ms

## 路径 B：自定义 sql.js WASM build

**步骤**：
1. clone sql.js 仓库
2. 修改 `Makefile` / `common.mk` 启用 SQLITE_ENABLE_FTS5
3. 跑 `make` 生成新 `sql-wasm.js` + `sql-wasm.wasm`
4. 替换 `bff/node_modules/sql.js/dist/sql-wasm.*`
5. 跑 vitest 验证 FTS5 可用

**优点**：
- 完全控制 build
- 不等 sql.js 官方

**缺点**：
- 维护负担（每次 sql.js 升级要重 build）
- WASM 编译需 emscripten 工具链（Linux 优先）
- Windows 上难
- 风险中（build 失败可能引入新 bug）

**推荐度**：低

## 路径 C：迁移 better-sqlite3

**步骤**：
1. `npm uninstall sql.js && npm install better-sqlite3`
2. 重写 `bff/src/db/init.js`：
   - `new Database(path)` 同步 API
   - `db.exec(sql)` 同步
   - `db.prepare(sql).all(...)` 同步
   - 去掉 `globalThis.__ERP_DB_STATE__` 跨模块黑魔法（better-sqlite3 是真正的 native binding，模块间共享同一 DB 对象）
3. FTS5 CREATE VIRTUAL TABLE 立即可用（better-sqlite3 内置 FTS5）
4. 跑全部 vitest + e2e

**优点**：
- FTS5 立即可用
- 性能 5-10x 提升（native vs WASM）
- 同步 API（无 async/await 包装）
- 真持久化（无需 saveDB() 手动调用）

**缺点**：
- 改 init.js 80+ 行
- 改 routes 的所有 `asyncHandler` 为 sync（如果 BFF 不需要异步）
- 失去 sql.js 的"纯 JS 无原生依赖"特性（破坏 Windows + macOS + Linux 全平台无 native build）
- `better-sqlite3` 需 node-gyp + 编译器（CI 必须配）

**推荐度**：中（性能 + FTS5 收益大，但破坏 cross-platform）

## 决策矩阵

| 维度 | A (等 sql.js 2.x) | B (自 build WASM) | C (迁 better-sqlite3) |
|---|---|---|---|
| 立即可用 | ❌ | ⚠️ 1-2 天 | ⚠️ 2-3 天 |
| FTS5 支持 | 自动 | 需配置 | 立即 |
| 风险 | 零 | 中（build 失败） | 中（API 差异） |
| 维护成本 | 零 | 高（每次升级重建） | 低 |
| 性能 | 不变 | 略好（编译选项） | 5-10x |
| 跨平台 | ✅ | ✅ | ⚠️ 需 native build |

## 推荐

**短期（0-3 月）**：路径 A — 等 sql.js 2.x 或上游启用 FTS5 build。期间 v6.5 的 LIKE + 复合索引够用（< 1k 候选人）。

**中期（> 1k 候选人）**：路径 C — 迁 better-sqlite3。性能 + FTS5 一并解决。

**不推荐**：路径 B（自 build WASM），维护成本高。

## 当前 FTS5 检测脚本

`bff/scripts/check-fts5.js` 跑：

```bash
node bff/scripts/check-fts5.js
```

期望输出：
- ✅ "FTS5 available" — 升级 sql.js 后预期
- ❌ "FTS5 NOT available" — 当前（sql.js 1.14.1）

退出码：0 = 可用，1 = 不可用（CI 可据此发 warning）。

## 监控

`bff/src/db/init.js` 启动时检测 FTS5 状态，console.warn。如果未来 SQL.js 出 FTS5-enabled build，warn 自动消失，FTS5 分支自动激活。