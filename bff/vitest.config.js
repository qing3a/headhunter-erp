import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 共享 db 状态（init.js 模块级 db 变量）
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    isolate: false,
  },
});
