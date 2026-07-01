// tests/global-setup.js - 一次性 init DB，给所有 test file 共享
import { init } from '../src/db/init.js';

export async function setup() {
  await init();
}
