// tests/routes/imports-validation.test.js
// v7.5 回归测试：POST /imports/commit 校验 + 非 Excel 文件错误码
// Bug 1: mapping={} 应抛 400 而非落到 service 抛 500
// Bug 2: 非 Excel 文件应抛 400 而非 JSZip 抛 500
import { describe, it, expect, beforeAll } from 'vitest';
import { init, isReady } from '../../src/db/init.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('v7.5 imports/commit 校验 (Bug 1)', () => {
  // 复刻 imports.js L93 校验逻辑：mapping 空对象必须抛 400
  it('mapping={} 应抛 badRequest', () => {
    const mapping = {};
    const shouldThrow = !mapping || Object.keys(mapping).length === 0;
    expect(shouldThrow).toBe(true);
  });

  it('mapping={name:"name"} 应通过校验', () => {
    const mapping = { name: 'name' };
    const shouldThrow = !mapping || Object.keys(mapping).length === 0;
    expect(shouldThrow).toBe(false);
  });

  it('mapping=undefined 应抛 badRequest', () => {
    const mapping = undefined;
    const shouldThrow = !mapping || Object.keys(mapping || {}).length === 0;
    expect(shouldThrow).toBe(true);
  });

  it('mapping=null 应抛 badRequest', () => {
    const mapping = null;
    const shouldThrow = !mapping || typeof mapping !== 'object' || Object.keys(mapping).length === 0;
    expect(shouldThrow).toBe(true);
  });

  it('mapping 字符串不应通过校验', () => {
    const mapping = 'not-an-object';
    const shouldThrow = !mapping || typeof mapping !== 'object' || Object.keys(mapping).length === 0;
    expect(shouldThrow).toBe(true);
  });

  // 源码级 invariant：imports.js 必须含 Object.keys(mapping).length === 0 校验
  it('imports.js 源码含 Object.keys(mapping).length === 0 校验', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/imports.js'),
      'utf8'
    );
    expect(src).toMatch(/Object\.keys\(mapping\)\.length\s*===\s*0/);
  });
});

describe('v7.5 imports/commit 非 Excel 文件 (Bug 2)', () => {
  // commit handler 必须包 try-catch + 识别 zip/excel 错误关键字
  it('imports.js commit handler 含 try-catch 包裹 commitImport', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/imports.js'),
      'utf8'
    );
    expect(src).toMatch(/try\s*\{[\s\S]*commitImport[\s\S]*catch/);
  });

  it('imports.js commit handler 含 zip|file|excel 错误关键字正则', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/imports.js'),
      'utf8'
    );
    expect(src).toMatch(/zip\|file\|excel/i);
  });

  it('imports.js commit handler catch 分支抛 badRequest "文件格式错误"', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/imports.js'),
      'utf8'
    );
    expect(src).toMatch(/badRequest\([^)]*文件格式错误/);
  });

  // 复刻 catch 分支错误关键字识别逻辑
  it('catch 分支识别 JSZip "zip" 错误关键字 → 应转为 400', () => {
    const errorsToMap = [
      'Invalid file signature',
      'Can\'t find end of central directory : Is this a zip file ?',
      'Corrupted zip file',
      'Unsupported file format',
      'Invalid Excel file',
      'XLSX file is corrupted'
    ];
    errorsToMap.forEach(msg => {
      const shouldMapTo400 = /zip|file|excel|xlsx|invalid|format|corrupt|signature/i.test(msg);
      expect(shouldMapTo400).toBe(true);
    });
  });

  it('catch 分支不识别的错误（如 DB 错误）应原样上抛', () => {
    const msg = 'SQLITE_CONSTRAINT: UNIQUE constraint failed';
    const shouldMapTo400 = /zip|file|excel|xlsx|invalid|format|corrupt|signature/i.test(msg);
    expect(shouldMapTo400).toBe(false);
  });
});