// tests/frontend/api-candidates-dedup.test.js
// P1-NEW-7: shared/api.js api.candidates 被赋值两次（死代码）
import { describe, it, expect, beforeAll } from 'vitest';
import { init, isReady } from '../../src/db/init.js';
import fs from 'fs';
import path from 'path';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P1-NEW-7: shared/api.js api.candidates 死代码清理', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../../shared/api.js'),
    'utf8'
  );

  it('api.candidates 应只被赋值一次', () => {
    // 数 'api.candidates = makeNs' 出现次数
    const matches = src.match(/api\.candidates\s*=\s*makeNs/g);
    expect(matches).toBeTruthy();
    expect(matches.length).toBe(1);
  });

  it('应保留 batchAction（第二处独有的方法）', () => {
    expect(src).toContain('batchAction:');
  });

  it('应保留 listExperiences 等子表方法', () => {
    expect(src).toContain('listExperiences');
    expect(src).toContain('listEducations');
    expect(src).toContain('listContacts');
  });
});