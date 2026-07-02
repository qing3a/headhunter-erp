import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: false,
    // ===== Phase 1 迁移：better-sqlite3 强文件锁 =====
    // 串行跑 test file（之前 sql.js 内存 copy 可并行；better-sqlite3 一个文件 → 必须串行）
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
