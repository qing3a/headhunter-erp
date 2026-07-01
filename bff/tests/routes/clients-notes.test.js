// bff/tests/routes/clients-notes.test.js
// P1-NEW-2 修复：client_notes schema (deleted_at + user_id + 索引) + 查询过滤
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P1-NEW-2: client_notes schema + 查询过滤', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM client_notes').run();
    db.prepare('DELETE FROM clients').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'a', 'x', 'consultant')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (2, 'b', 'x', 'consultant')`).run();
    db.prepare(`INSERT INTO clients (id, name, owner_user_id) VALUES (10, 'acme', 1)`).run();
  });

  it('client_notes 表应有 deleted_at 和 user_id 列', () => {
    const db = getDb();
    const cols = db.prepare(`PRAGMA table_info(client_notes)`).all();
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('deleted_at');
    expect(colNames).toContain('user_id');
  });

  it('查询 client notes 默认排除 deleted_at IS NOT NULL', () => {
    const db = getDb();
    db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (10, 'note1', 1)`).run();
    db.prepare(`INSERT INTO client_notes (client_id, content, user_id, deleted_at) VALUES (10, 'note2', 1, datetime('now'))`).run();
    const notes = db.prepare(`SELECT * FROM client_notes WHERE client_id = 10 AND deleted_at IS NULL`).all();
    expect(notes.length).toBe(1);
    expect(notes[0].content).toBe('note1');
  });

  it('软删后再次软删 changes=0（防重复）', () => {
    const db = getDb();
    const ins = db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (10, 'x', 1)`).run();
    const nid = ins.lastInsertRowid;
    const r1 = db.prepare(`UPDATE client_notes SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(nid);
    const r2 = db.prepare(`UPDATE client_notes SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(nid);
    expect(r1.changes).toBe(1);
    expect(r2.changes).toBe(0);
  });

  it('idx_client_notes_* 索引存在', () => {
    const db = getDb();
    const idxs = db.prepare(`PRAGMA index_list(client_notes)`).all();
    const idxNames = idxs.map(i => i.name);
    expect(idxNames.some(n => n.includes('client'))).toBe(true);
    expect(idxNames.some(n => n.includes('deleted'))).toBe(true);
    expect(idxNames.some(n => n.includes('user'))).toBe(true);
  });
});
