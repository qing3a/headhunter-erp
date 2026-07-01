// tests/setup.js - vitest setupFiles，在测试 context 内运行
// 关键：与测试共享模块状态（globalSetup 是独立 context）
import { beforeAll } from 'vitest';
import { init, isReady } from '../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) {
    await init();
  }
}, 30000);
