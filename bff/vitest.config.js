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
  },
});
