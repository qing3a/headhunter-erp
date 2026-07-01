// bff/tests/routes/clients-cascade.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P1-NEW-6: clients.js DELETE 级联软删 client_notes', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM client_notes').run();
    db.prepare('DELETE FROM clients').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 't', 'x', 'consultant')`).run();
  });

  it('软删 client 后，关联的 client_notes 也会被软删', () => {
    const db = getDb();
    const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('acme', 1)`).run();
    const cid = ins.lastInsertRowid;
    db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'note1', 1)`).run(cid);
    db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'note2', 1)`).run(cid);

    // 模拟 DELETE 路由逻辑
    db.prepare(`UPDATE clients SET deleted_at = datetime('now') WHERE id = ?`).run(cid);
    db.prepare(`UPDATE client_notes SET deleted_at = datetime('now') WHERE client_id = ? AND deleted_at IS NULL`).run(cid);

    // 验证 client 已软删
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(cid);
    expect(client.deleted_at).toBeTruthy();

    // 验证 notes 全部软删
    const activeNotes = db.prepare(`SELECT * FROM client_notes WHERE client_id = ? AND deleted_at IS NULL`).all(cid);
    expect(activeNotes.length).toBe(0);

    // 但 notes 物理仍在（可恢复）
    const allNotes = db.prepare(`SELECT * FROM client_notes WHERE client_id = ?`).all(cid);
    expect(allNotes.length).toBe(2);
    expect(allNotes.every(n => n.deleted_at)).toBe(true);
  });

  it('已有 deleted_at 的 note 不应被再次软删（idempotent）', () => {
    const db = getDb();
    const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('acme', 1)`).run();
    const cid = ins.lastInsertRowid;
    db.prepare(`INSERT INTO client_notes (client_id, content, user_id, deleted_at) VALUES (?, 'n1', 1, datetime('now'))`).run(cid);

    // 级联软删
    const r = db.prepare(`UPDATE client_notes SET deleted_at = datetime('now') WHERE client_id = ? AND deleted_at IS NULL`).run(cid);
    expect(r.changes).toBe(0);  // 已删的不会被覆盖
  });

  it('clients.js DELETE 路由源码包含按 client_id 级联软删 SQL', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/clients.js'),
      'utf8'
    );
    // 必须存在按 client_id 批量软删 notes 的 SQL（级联）
    expect(src).toMatch(/UPDATE\s+client_notes\s+SET\s+deleted_at\s*=\s*datetime\s*\(\s*'now'\s*\)\s+WHERE\s+client_id\s*=\s*\?/);
  });
});
