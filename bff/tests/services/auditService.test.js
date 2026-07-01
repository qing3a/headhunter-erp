// bff/tests/services/auditService.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';
import auditService from '../../src/services/auditService.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P1-NEW-4: auditService.log 同步写入', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM audit_log').run();
  });

  it('log 后立即能查（不再 setImmediate 延迟）', () => {
    auditService.log(1, 'TEST_ACTION', 'test', '1', { foo: 'bar' }, '127.0.0.1');
    // 立即查询，不需要 await
    const row = getDb().prepare(
      `SELECT * FROM audit_log WHERE action = 'TEST_ACTION' ORDER BY id DESC LIMIT 1`
    ).get();
    expect(row).toBeTruthy();
    expect(row.detail).toContain('foo');
    expect(row.ip).toBe('127.0.0.1');
  });

  it('audit log 同步阻塞：连续两次 log 后两次都能查到', () => {
    auditService.log(1, 'TEST_A', null, null, null, null);
    auditService.log(1, 'TEST_B', null, null, null, null);
    const a = getDb().prepare(`SELECT * FROM audit_log WHERE action='TEST_A'`).get();
    const b = getDb().prepare(`SELECT * FROM audit_log WHERE action='TEST_B'`).get();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it('log 抛错也不影响主流程（writeLog 内 try-catch）', () => {
    // 模拟异常：detail 是循环引用，JSON.stringify 抛错
    const circular = {};
    circular.self = circular;
    expect(() => auditService.log(1, 'CIRC', null, null, circular, null)).not.toThrow();
  });
});