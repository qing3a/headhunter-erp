// tests/frontend/candidate-detail-api.test.js
// P1-NEW-5: shared/api.js 子表 list 方法应接受 options 参数并拼 limit/offset query
//          pages/candidate-detail.html 应调用 listExperiences 时传入 limit
import { describe, it, expect, beforeAll } from 'vitest';
import { init, isReady } from '../../src/db/init.js';
import fs from 'fs';
import path from 'path';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P1-NEW-5: api.js 子表 list 支持 options 参数', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../../shared/api.js'),
    'utf8'
  );

  it('listExperiences 接 options 参数并生成 limit/offset query', () => {
    const match = src.match(/listExperiences:\s*function\s*\([^)]*\)\s*\{([\s\S]+?)\}/);
    expect(match).toBeTruthy();
    const body = match[1];
    expect(body).toMatch(/options/);
    expect(body).toMatch(/limit/);
    expect(body).toMatch(/offset/);
  });

  it('listEducations 同样支持 options', () => {
    const match = src.match(/listEducations:\s*function\s*\([^)]*\)\s*\{([\s\S]+?)\}/);
    expect(match).toBeTruthy();
    expect(match[1]).toMatch(/options/);
  });

  it('listContacts 同样支持 options', () => {
    const match = src.match(/listContacts:\s*function\s*\([^)]*\)\s*\{([\s\S]+?)\}/);
    expect(match).toBeTruthy();
    expect(match[1]).toMatch(/options/);
  });

  it('candidate-detail.html 调 listExperiences 时传 limit/offset', () => {
    const detail = fs.readFileSync(
      path.join(__dirname, '../../../pages/candidate-detail.html'),
      'utf8'
    );
    // 至少一处 listExperiences 调用带 limit
    expect(detail).toMatch(/listExperiences\s*\([^,)]+,\s*\{[^}]*limit/);
  });
});
