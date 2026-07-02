import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: false,
    // ===== Phase 1 迁移：better-sqlite3 强文件锁 =====
    // 串行跑 test file（之前 sql.js 内存 copy 可并行；better-sqlite3 一个文件 → 必须串行）
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    // ===== Phase 1+2：e2e-edge 脚本是裸脚本（用 http.request 连 BFF），不是 vitest 单元 =====
    // 单独由 `npm run e2e` 跑（通过 tests/e2e-runner.js）
    exclude: ['**/node_modules/**', '**/tests/e2e-edge/**', '**/dist/**'],
    // ===== v7.5 新增：coverage 报告 =====
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'src/db/init.js',     // 全部 sql DDL 在这里
        'src/index.js',        // entry point
        '**/migrations/**',
        'src/middleware/errorHandler.js'  // 极简错误处理
      ],
      thresholds: {
        // ===== v7.5 临时低阈值：现有 346 测试主要测 DB / 工具，路由 handler 通过 supertest 覆盖有限 =====
        // 下次 PR 再补 route-level supertest 覆盖率后再上调
        lines: 5,
        functions: 15,
        branches: 2,
        statements: 5
      }
    }
  },
});
