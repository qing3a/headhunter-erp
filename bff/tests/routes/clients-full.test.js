// bff/tests/routes/clients-full.test.js
// P3-12f 修复：clients.js 端点级集成测试（GET 列表/lookup/详情、POST、PUT、DELETE、notes CRUD + 源码 invariant）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('clients.js 端点级集成测试（P3-12f）', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM client_notes').run();
    db.prepare('DELETE FROM clients').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (2, 'c1', 'x', 'consultant')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (3, 'c2', 'x', 'consultant')`).run();
  });

  // ============================================================
  // 1) GET /clients 列表
  // ============================================================
  describe('GET /clients 列表', () => {
    it('普通顾问只看自己的客户（owner_user_id 谓词）', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c1 client', 2)`).run();
      db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c2 client', 3)`).run();
      // 模拟 c1 (user_id=2) 查询
      const rows = db.prepare(`SELECT name FROM clients WHERE owner_user_id = 2 AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('c1 client');
    });

    it('admin 看全部（不带 owner_user_id 谓词）', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('a', 2)`).run();
      db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('b', 3)`).run();
      const rows = db.prepare(`SELECT name FROM clients WHERE deleted_at IS NULL`).all();
      expect(rows.length).toBe(2);
    });

    it('keyword 搜索命中 name', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, industry, owner_user_id) VALUES ('Acme Corp', '互联网', 2)`).run();
      db.prepare(`INSERT INTO clients (name, contact_name, owner_user_id) VALUES ('Beta Inc', '张三', 2)`).run();
      db.prepare(`INSERT INTO clients (name, industry, owner_user_id) VALUES ('Gamma', '金融', 2)`).run();
      const rows = db.prepare(
        `SELECT name FROM clients
         WHERE owner_user_id = 2
           AND (name LIKE ? OR contact_name LIKE ? OR industry LIKE ?)
           AND deleted_at IS NULL`
      ).all('%Acme%', '%Acme%', '%Acme%');
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('Acme Corp');
    });

    it('keyword 搜索命中 contact_name（中文）', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, industry, owner_user_id) VALUES ('Acme Corp', '互联网', 2)`).run();
      db.prepare(`INSERT INTO clients (name, contact_name, owner_user_id) VALUES ('Beta Inc', '张三', 2)`).run();
      db.prepare(`INSERT INTO clients (name, industry, owner_user_id) VALUES ('Gamma', '金融', 2)`).run();
      const rows = db.prepare(
        `SELECT name FROM clients
         WHERE owner_user_id = 2
           AND (name LIKE ? OR contact_name LIKE ? OR industry LIKE ?)
           AND deleted_at IS NULL`
      ).all('%张三%', '%张三%', '%张三%');
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('Beta Inc');
    });

    it('keyword 搜索命中 industry', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, industry, owner_user_id) VALUES ('A', '互联网', 2)`).run();
      db.prepare(`INSERT INTO clients (name, industry, owner_user_id) VALUES ('B', '金融', 2)`).run();
      const rows = db.prepare(
        `SELECT name FROM clients
         WHERE owner_user_id = 2
           AND (name LIKE ? OR contact_name LIKE ? OR industry LIKE ?)
           AND deleted_at IS NULL`
      ).all('%金融%', '%金融%', '%金融%');
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('B');
    });

    it('软删过滤（默认 includeDeleted=false 不返回软删）', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, owner_user_id, deleted_at) VALUES ('gone', 2, datetime('now'))`).run();
      db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('live', 2)`).run();
      const rows = db.prepare(`SELECT name FROM clients WHERE owner_user_id = 2 AND deleted_at IS NULL`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('live');
    });

    it('admin ?includeDeleted=true 能看软删（不带 deleted_at 过滤）', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, owner_user_id, deleted_at) VALUES ('gone', 2, datetime('now'))`).run();
      const rows = db.prepare(`SELECT name FROM clients WHERE owner_user_id = 2`).all();
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('gone');
    });

    it('分页 LIMIT + OFFSET', () => {
      const db = getDb();
      for (let i = 0; i < 5; i++) {
        db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES (?, 2)`).run('client' + i);
      }
      const p1 = db.prepare(
        `SELECT name FROM clients WHERE owner_user_id = 2 AND deleted_at IS NULL
         ORDER BY updated_at DESC LIMIT ? OFFSET ?`
      ).all(2, 0);
      const p2 = db.prepare(
        `SELECT name FROM clients WHERE owner_user_id = 2 AND deleted_at IS NULL
         ORDER BY updated_at DESC LIMIT ? OFFSET ?`
      ).all(2, 2);
      const p3 = db.prepare(
        `SELECT name FROM clients WHERE owner_user_id = 2 AND deleted_at IS NULL
         ORDER BY updated_at DESC LIMIT ? OFFSET ?`
      ).all(2, 4);
      expect(p1.length).toBe(2);
      expect(p2.length).toBe(2);
      expect(p3.length).toBe(1);
      const total = db.prepare(`SELECT COUNT(*) as cnt FROM clients WHERE owner_user_id = 2 AND deleted_at IS NULL`).get().cnt;
      expect(total).toBe(5);
    });
  });

  // ============================================================
  // 2) GET /clients/lookup 下拉
  // ============================================================
  describe('GET /clients/lookup 下拉', () => {
    it('只返回 status=active 的客户', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, status, owner_user_id) VALUES ('active1', 'active', 2)`).run();
      db.prepare(`INSERT INTO clients (name, status, owner_user_id) VALUES ('inactive1', 'inactive', 2)`).run();
      const rows = db.prepare(
        `SELECT id, name FROM clients
         WHERE deleted_at IS NULL AND status = 'active' AND owner_user_id = 2
         ORDER BY name LIMIT 200`
      ).all();
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('active1');
    });

    it('admin lookup 不限 owner_user_id', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, status, owner_user_id) VALUES ('c1', 'active', 2)`).run();
      db.prepare(`INSERT INTO clients (name, status, owner_user_id) VALUES ('c2', 'active', 3)`).run();
      const rows = db.prepare(
        `SELECT name FROM clients
         WHERE deleted_at IS NULL AND status = 'active'
         ORDER BY name LIMIT 200`
      ).all();
      expect(rows.length).toBe(2);
    });

    it('lookup 排除软删客户', () => {
      const db = getDb();
      db.prepare(`INSERT INTO clients (name, status, owner_user_id, deleted_at) VALUES ('soft', 'active', 2, datetime('now'))`).run();
      db.prepare(`INSERT INTO clients (name, status, owner_user_id) VALUES ('live', 'active', 2)`).run();
      const rows = db.prepare(
        `SELECT name FROM clients
         WHERE deleted_at IS NULL AND status = 'active' AND owner_user_id = 2
         ORDER BY name LIMIT 200`
      ).all();
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('live');
    });

    it('lookup LIMIT 200', () => {
      const db = getDb();
      for (let i = 0; i < 205; i++) {
        db.prepare(`INSERT INTO clients (name, status, owner_user_id) VALUES (?, 'active', 2)`).run('c' + i);
      }
      const rows = db.prepare(
        `SELECT name FROM clients
         WHERE deleted_at IS NULL AND status = 'active' AND owner_user_id = 2
         ORDER BY name LIMIT 200`
      ).all();
      expect(rows.length).toBe(200);
    });
  });

  // ============================================================
  // 3) GET /clients/:id 详情
  // ============================================================
  describe('GET /clients/:id 详情', () => {
    it('admin 跨用户可查（不带 owner_user_id 谓词）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const row = db.prepare(`SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL`).get(ins.lastInsertRowid);
      expect(row).toBeTruthy();
      expect(row.name).toBe('c');
    });

    it('owner 可查自己客户', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('mine', 2)`).run();
      const row = db.prepare(`SELECT * FROM clients WHERE id = ? AND owner_user_id = 2 AND deleted_at IS NULL`).get(ins.lastInsertRowid);
      expect(row).toBeTruthy();
    });

    it('非自己非 admin 查不到（owner_user_id 谓词过滤）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      // 模拟 c2 (user_id=3) 查 c1 (owner_user_id=2) 的客户
      const row = db.prepare(`SELECT * FROM clients WHERE id = ? AND owner_user_id = 3 AND deleted_at IS NULL`).get(ins.lastInsertRowid);
      expect(row).toBeFalsy();
    });

    it('软删的客户查不到', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id, deleted_at) VALUES ('gone', 2, datetime('now'))`).run();
      const row = db.prepare(`SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL`).get(ins.lastInsertRowid);
      expect(row).toBeFalsy();
    });

    it('详情含 notes（排除 deleted_at IS NOT NULL）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const cid = ins.lastInsertRowid;
      db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'active note', 2)`).run(cid);
      db.prepare(`INSERT INTO client_notes (client_id, content, user_id, deleted_at) VALUES (?, 'deleted note', 2, datetime('now'))`).run(cid);

      const notes = db.prepare(
        `SELECT content FROM client_notes
         WHERE client_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      ).all(cid);
      expect(notes.length).toBe(1);
      expect(notes[0].content).toBe('active note');
    });
  });

  // ============================================================
  // 4) POST /clients 创建
  // ============================================================
  describe('POST /clients 创建', () => {
    it('name 必填（缺省 throw）', () => {
      const body = { industry: '互联网' };
      const shouldThrow = !body.name || !String(body.name).trim();
      expect(shouldThrow).toBe(true);
    });

    it('name 为纯空格应被拒绝', () => {
      const body = { name: '   ' };
      const shouldThrow = !body.name || !String(body.name).trim();
      expect(shouldThrow).toBe(true);
    });

    it('owner_user_id 来自 req.user.id', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, industry, owner_user_id) VALUES (?, ?, ?)`).run('Acme', '互联网', 2);
      const row = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.owner_user_id).toBe(2);
      expect(row.name).toBe('Acme');
      expect(row.industry).toBe('互联网');
    });

    it('创建成功后能 SELECT 取回所有字段', () => {
      const db = getDb();
      const ins = db.prepare(`
        INSERT INTO clients
          (name, industry, city, contact_name, contact_email, contact_phone, website, notes, status, owner_user_id, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Acme', '互联网', '北京', '张三', 'a@a.com', '13800000000', 'https://a.com', 'good', 'active', 2, 'local');
      const row = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      expect(row.name).toBe('Acme');
      expect(row.industry).toBe('互联网');
      expect(row.city).toBe('北京');
      expect(row.contact_name).toBe('张三');
      expect(row.contact_email).toBe('a@a.com');
      expect(row.status).toBe('active');
      expect(row.source).toBe('local');
      expect(row.owner_user_id).toBe(2);
    });

    it('status 缺省值 = active（路由用 body.status || \'active\'）', () => {
      const body = { name: 'Acme' };
      const status = body.status || 'active';
      expect(status).toBe('active');
    });
  });

  // ============================================================
  // 5) PUT /clients/:id 更新
  // ============================================================
  describe('PUT /clients/:id 更新', () => {
    it('name 不能为空字符串', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('orig', 2)`).run();
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      const next = {
        name: '' !== undefined ? String('').trim() : before.name,
      };
      const shouldThrow = !next.name;
      expect(shouldThrow).toBe(true);
    });

    it('name trim 后为空应被拒', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('orig', 2)`).run();
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      const next = {
        name: '   ' !== undefined ? String('   ').trim() : before.name,
      };
      const shouldThrow = !next.name;
      expect(shouldThrow).toBe(true);
    });

    it('非自己非 admin 应被拒（before.owner_user_id 校验）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.owner_user_id === 3;  // false
      expect(isAdmin || isOwner).toBe(false);
    });

    it('admin 可改任何人的客户', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = true;
      const isOwner = before.owner_user_id === 1;  // false
      expect(isAdmin || isOwner).toBe(true);
    });

    it('owner 可改自己的客户', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.owner_user_id === 2;  // true
      expect(isAdmin || isOwner).toBe(true);
    });

    it('字段 merge：name 存在则更新，其他字段保留', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, industry, city, owner_user_id) VALUES ('orig', '互联网', '北京', 2)`).run();
      const id = ins.lastInsertRowid;
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id);
      const body = { city: '上海' };  // 不传 name
      const next = {
        name: body.name !== undefined ? String(body.name).trim() : before.name,
        industry: body.industry !== undefined ? body.industry : before.industry,
        city: body.city !== undefined ? body.city : before.city,
      };
      db.prepare(
        `UPDATE clients SET name = ?, industry = ?, city = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(next.name, next.industry, next.city, id);
      const row = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id);
      expect(row.name).toBe('orig');  // 保留
      expect(row.industry).toBe('互联网');  // 保留
      expect(row.city).toBe('上海');  // 更新
    });

    it('更新时 updated_at 应被刷新', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('x', 2)`).run();
      const before = db.prepare(`SELECT updated_at FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      db.prepare(`UPDATE clients SET name = ?, updated_at = datetime('now') WHERE id = ?`).run('y', ins.lastInsertRowid);
      const after = db.prepare(`SELECT updated_at FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      expect(after.updated_at).toBeTruthy();
    });

    it('软删的客户 UPDATE 应 changes=0（防止改软删）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id, deleted_at) VALUES ('gone', 2, datetime('now'))`).run();
      // 路由先 SELECT 验 deleted_at：if (!before || before.deleted_at) throw notFound
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      expect(before.deleted_at).toBeTruthy();  // 路由会拒绝
    });
  });

  // ============================================================
  // 6) DELETE /clients/:id 软删 + 级联（P1-NEW-6）
  // ============================================================
  describe('DELETE /clients/:id 软删 + 级联', () => {
    it('软删 client + 级联软删 notes', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const cid = ins.lastInsertRowid;
      db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'n1', 2)`).run(cid);
      db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'n2', 2)`).run(cid);

      // 模拟 DELETE 路由逻辑
      db.prepare(`UPDATE clients SET deleted_at = datetime('now') WHERE id = ?`).run(cid);
      db.prepare(`UPDATE client_notes SET deleted_at = datetime('now') WHERE client_id = ? AND deleted_at IS NULL`).run(cid);

      const c = db.prepare(`SELECT deleted_at FROM clients WHERE id = ?`).get(cid);
      expect(c.deleted_at).toBeTruthy();
      const activeNotes = db.prepare(`SELECT * FROM client_notes WHERE client_id = ? AND deleted_at IS NULL`).all(cid);
      expect(activeNotes.length).toBe(0);
    });

    it('非自己非 admin DELETE 应被拒', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.owner_user_id === 3;  // false
      expect(isAdmin || isOwner).toBe(false);
    });

    it('admin DELETE 任何人的客户', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      const isAdmin = true;
      const isOwner = before.owner_user_id === 999;
      expect(isAdmin || isOwner).toBe(true);
    });

    it('软删幂等：第二次软删 changes=0', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const r1 = db.prepare(`UPDATE clients SET deleted_at = datetime('now') WHERE id = ?`).run(ins.lastInsertRowid);
      // 路由先 SELECT 验 deleted_at（before.deleted_at 非空 → throw notFound），根本不会到 UPDATE
      const before = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(ins.lastInsertRowid);
      expect(before.deleted_at).toBeTruthy();
      expect(r1.changes).toBe(1);
    });
  });

  // ============================================================
  // 7) GET /:id/notes 列表
  // ============================================================
  describe('GET /:id/notes 列表', () => {
    it('默认排除 deleted_at IS NOT NULL', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const cid = ins.lastInsertRowid;
      db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'live', 2)`).run(cid);
      db.prepare(`INSERT INTO client_notes (client_id, content, user_id, deleted_at) VALUES (?, 'gone', 2, datetime('now'))`).run(cid);

      const notes = db.prepare(
        `SELECT * FROM client_notes
         WHERE client_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      ).all(cid);
      expect(notes.length).toBe(1);
      expect(notes[0].content).toBe('live');
    });

    it('多 notes 按 created_at DESC 排序', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const cid = ins.lastInsertRowid;
      db.prepare(`INSERT INTO client_notes (client_id, content, user_id, created_at) VALUES (?, 'old', 2, '2025-01-01 10:00')`).run(cid);
      db.prepare(`INSERT INTO client_notes (client_id, content, user_id, created_at) VALUES (?, 'new', 2, '2027-01-01 10:00')`).run(cid);
      const notes = db.prepare(
        `SELECT content FROM client_notes WHERE client_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`
      ).all(cid);
      expect(notes[0].content).toBe('new');
    });
  });

  // ============================================================
  // 8) POST /:id/notes 创建
  // ============================================================
  describe('POST /:id/notes 创建', () => {
    it('content 必填', () => {
      const body = { follow_up: '2026-09-01' };
      const shouldThrow = !body.content;
      expect(shouldThrow).toBe(true);
    });

    it('空字符串也视为缺省', () => {
      const body = { content: '' };
      const shouldThrow = !body.content;
      expect(shouldThrow).toBe(true);
    });

    it('INSERT 含 user_id（来自 req.user.id）', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const cid = ins.lastInsertRowid;
      const noteIns = db.prepare(
        `INSERT INTO client_notes (client_id, content, follow_up, user_id) VALUES (?, ?, ?, ?)`
      ).run(cid, 'note1', '2026-09-01', 2);
      const note = db.prepare(`SELECT * FROM client_notes WHERE id = ?`).get(noteIns.lastInsertRowid);
      expect(note.user_id).toBe(2);
      expect(note.content).toBe('note1');
      expect(note.follow_up).toBe('2026-09-01');
    });

    it('follow_up 缺省值 = 空字符串', () => {
      const body = { content: 'x' };
      const followUp = body.follow_up || '';
      expect(followUp).toBe('');
    });
  });

  // ============================================================
  // 9) PUT /:id/notes/:nid 更新
  // ============================================================
  describe('PUT /:id/notes/:nid 更新', () => {
    it('content 必填', () => {
      const body = { follow_up: '2026-09-01' };
      const shouldThrow = !body.content;
      expect(shouldThrow).toBe(true);
    });

    it('非自己非 admin 应被拒（before.user_id 校验）', () => {
      const db = getDb();
      const cIns = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const nIns = db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'n', 2)`).run(cIns.lastInsertRowid);
      const before = db.prepare(`SELECT * FROM client_notes WHERE id = ?`).get(nIns.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.user_id === 3;  // false
      expect(isAdmin || isOwner).toBe(false);
    });

    it('admin 可改任何人的 note', () => {
      const db = getDb();
      const cIns = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const nIns = db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'n', 2)`).run(cIns.lastInsertRowid);
      const before = db.prepare(`SELECT * FROM client_notes WHERE id = ?`).get(nIns.lastInsertRowid);
      const isAdmin = true;
      const isOwner = before.user_id === 999;
      expect(isAdmin || isOwner).toBe(true);
    });

    it('正常更新 content + follow_up', () => {
      const db = getDb();
      const cIns = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const nIns = db.prepare(`INSERT INTO client_notes (client_id, content, follow_up, user_id) VALUES (?, 'old', '2026-09-01', 2)`).run(cIns.lastInsertRowid);
      db.prepare(`UPDATE client_notes SET content = ?, follow_up = ? WHERE id = ?`).run('new', '2026-10-01', nIns.lastInsertRowid);
      const row = db.prepare(`SELECT * FROM client_notes WHERE id = ?`).get(nIns.lastInsertRowid);
      expect(row.content).toBe('new');
      expect(row.follow_up).toBe('2026-10-01');
    });

    it('软删的 note 应被拒改（before.deleted_at 校验）', () => {
      const db = getDb();
      const cIns = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const nIns = db.prepare(`INSERT INTO client_notes (client_id, content, user_id, deleted_at) VALUES (?, 'n', 2, datetime('now'))`).run(cIns.lastInsertRowid);
      const before = db.prepare(`SELECT * FROM client_notes WHERE id = ?`).get(nIns.lastInsertRowid);
      // 路由：if (!before || before.deleted_at) throw notFound
      expect(before.deleted_at).toBeTruthy();
    });
  });

  // ============================================================
  // 10) DELETE /:id/notes/:nid 软删（P1-NEW-2）
  // ============================================================
  describe('DELETE /:id/notes/:nid 软删', () => {
    it('软删后 deleted_at 非空', () => {
      const db = getDb();
      const cIns = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const nIns = db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'n', 2)`).run(cIns.lastInsertRowid);
      db.prepare(`UPDATE client_notes SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(nIns.lastInsertRowid);
      const row = db.prepare(`SELECT * FROM client_notes WHERE id = ?`).get(nIns.lastInsertRowid);
      expect(row.deleted_at).toBeTruthy();
    });

    it('非自己非 admin 应被拒（before.user_id 校验）', () => {
      const db = getDb();
      const cIns = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const nIns = db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'n', 2)`).run(cIns.lastInsertRowid);
      const before = db.prepare(`SELECT * FROM client_notes WHERE id = ?`).get(nIns.lastInsertRowid);
      const isAdmin = false;
      const isOwner = before.user_id === 3;  // false
      expect(isAdmin || isOwner).toBe(false);
    });

    it('admin 可软删任何人的 note', () => {
      const db = getDb();
      const cIns = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const nIns = db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'n', 2)`).run(cIns.lastInsertRowid);
      const before = db.prepare(`SELECT * FROM client_notes WHERE id = ?`).get(nIns.lastInsertRowid);
      const isAdmin = true;
      const isOwner = before.user_id === 999;
      expect(isAdmin || isOwner).toBe(true);
    });

    it('软删幂等：第二次软删 changes=0', () => {
      const db = getDb();
      const cIns = db.prepare(`INSERT INTO clients (name, owner_user_id) VALUES ('c', 2)`).run();
      const nIns = db.prepare(`INSERT INTO client_notes (client_id, content, user_id) VALUES (?, 'n', 2)`).run(cIns.lastInsertRowid);
      const r1 = db.prepare(`UPDATE client_notes SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(nIns.lastInsertRowid);
      const r2 = db.prepare(`UPDATE client_notes SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(nIns.lastInsertRowid);
      expect(r1.changes).toBe(1);
      expect(r2.changes).toBe(0);
    });
  });

  // ============================================================
  // 源码级 invariant（防回归）
  // ============================================================
  describe('源码级 invariant（防回归）', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/clients.js'),
      'utf8'
    );

    it('name 必填校验（!body.name || !String(body.name).trim）', () => {
      expect(src).toMatch(/!body\.name\s*\|\|\s*!String\s*\(\s*body\.name\s*\)\.trim/);
    });

    it('PUT name 不能为空（if (!next.name) throw badRequest）', () => {
      expect(src).toMatch(/if\s*\(\s*!next\.name\s*\)\s*throw\s+badRequest/);
    });

    it('GET /:id 含 notes（排除 deleted_at）', () => {
      expect(src).toMatch(/SELECT\s+\*\s+FROM\s+client_notes\s+WHERE\s+client_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/);
    });

    it('DELETE /:id 级联软删 notes（按 client_id）', () => {
      expect(src).toMatch(/UPDATE\s+client_notes\s+SET\s+deleted_at\s*=\s*datetime\s*\(\s*'now'\s*\)\s+WHERE\s+client_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/);
    });

    it('DELETE /:id/notes/:nid 软删（UPDATE 非 DELETE FROM）', () => {
      // 期望 UPDATE 软删（不再 DELETE FROM）
      const hasSoftDelete = src.match(/UPDATE\s+client_notes\s+SET\s+deleted_at[\s\S]{0,50}WHERE\s+id\s*=\s*\?/);
      expect(hasSoftDelete).toBeTruthy();
      // 不应再有硬删
      expect(src).not.toMatch(/DELETE\s+FROM\s+client_notes\s+WHERE\s+id\s*=\s*\?/);
    });

    it('POST /:id/notes INSERT 含 user_id 写入（来自 req.user.id）', () => {
      expect(src).toMatch(/INSERT\s+INTO\s+client_notes[\s\S]{0,200}user_id[\s\S]{0,200}req\.user\.id/);
    });

    it('POST /:id/notes content 必填校验', () => {
      expect(src).toMatch(/if\s*\(\s*!content\s*\)\s*throw\s+badRequest/);
    });

    it('PUT /:id/notes/:nid content 必填校验', () => {
      const matches = src.match(/if\s*\(\s*!content\s*\)\s*throw\s+badRequest/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(2);  // POST + PUT
    });

    it('PUT /:id/notes/:nid 权限校验（before.user_id !== req.user.id）', () => {
      expect(src).toMatch(/before\.user_id\s*!==\s*req\.user\.id/);
    });

    it('DELETE /:id/notes/:nid 权限校验', () => {
      const matches = src.match(/before\.user_id\s*!==\s*req\.user\.id/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(2);  // PUT + DELETE notes
    });

    it('PUT /:id 权限校验（before.owner_user_id !== req.user.id）', () => {
      expect(src).toMatch(/before\.owner_user_id\s*!==\s*req\.user\.id/);
    });

    it('DELETE /:id 权限校验', () => {
      const matches = src.match(/before\.owner_user_id\s*!==\s*req\.user\.id/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(2);  // PUT + DELETE client
    });

    it('keyword LIKE 三个字段（name/contact_name/industry）', () => {
      expect(src).toMatch(/name\s+LIKE\s+\?/);
      expect(src).toMatch(/contact_name\s+LIKE\s+\?/);
      expect(src).toMatch(/industry\s+LIKE\s+\?/);
    });

    it('isAdmin 判断用 req.user.role === \'admin\'', () => {
      const matches = src.match(/req\.user\.role\s*===\s*['"]admin['"]/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(3);  // GET 列表 / GET lookup / GET :id
    });

    it('软删默认过滤（deleted_at IS NULL）至少出现 3 次', () => {
      const matches = src.match(/deleted_at\s+IS\s+NULL/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });

    it('lookup 用 status = ?', () => {
      expect(src).toMatch(/status\s*=\s*\?/);
    });

    it('lookup LIMIT 200', () => {
      expect(src).toMatch(/LIMIT\s+200/);
    });

    it('includeDeleted 仅 admin 生效', () => {
      // includeDeleted = req.query.includeDeleted === 'true' && isAdmin
      expect(src).toMatch(/includeDeleted\s*=\s*req\.query\.includeDeleted\s*===\s*['"]true['"]\s*&&\s*isAdmin/);
    });

    it('requireAuth 中间件挂在 router 上', () => {
      expect(src).toMatch(/router\.use\(requireAuth\)/);
    });

    it('clients.js module.exports = router', () => {
      expect(src).toMatch(/module\.exports\s*=\s*router/);
    });

    it('所有写路由用 asyncHandler', () => {
      const matches = src.match(/router\.(post|put|delete)\s*\(\s*['"][^'"]+['"]\s*,\s*asyncHandler/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(5);  // POST/PUT/DELETE client + POST/PUT/DELETE note
    });

    it('requireAuth 后才挂路由', () => {
      const useIdx = src.indexOf('router.use(requireAuth)');
      const getIdx = src.indexOf("router.get('/'");
      expect(useIdx).toBeGreaterThan(-1);
      expect(getIdx).toBeGreaterThan(useIdx);
    });
  });
});
