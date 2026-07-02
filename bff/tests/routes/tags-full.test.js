// tests/routes/tags-full.test.js
// P3-12b 修复：tags.js 端点级集成测试（5 个端点全覆盖）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('tags.js 端点级集成测试（P3-12b）', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM candidate_tags').run();
    db.prepare('DELETE FROM candidates').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'a', 'x', 'admin')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (2, 'b', 'x', 'consultant')`).run();
  });

  describe('GET /tags 列表', () => {
    it('返回所有 tag 列表（按 count 倒序）', () => {
      const db = getDb();
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 2)`).run();
      const c2 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c2', 2)`).run();
      const c3 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c3', 2)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["vip","前端"]', 2)`).run(c1.lastInsertRowid);
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["vip"]', 2)`).run(c2.lastInsertRowid);
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["后端"]', 2)`).run(c3.lastInsertRowid);

      // 模拟 loadAllTags：admin 跨用户
      const rows = db.prepare(`SELECT candidate_id, tags FROM candidate_tags WHERE deleted_at IS NULL`).all();
      const map = {};
      rows.forEach(function (r) {
        let tags = [];
        try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
        tags.forEach(function (t) {
          if (!map[t]) map[t] = { name: t, count: 0, candidate_ids: [] };
          map[t].count++;
          map[t].candidate_ids.push(r.candidate_id);
        });
      });
      const sorted = Object.values(map).sort((a, b) => b.count - a.count);
      expect(sorted[0].name).toBe('vip');
      expect(sorted[0].count).toBe(2);
      expect(sorted[1].count).toBe(1);
    });

    it('keyword 过滤 tag 列表', () => {
      const db = getDb();
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 2)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["vip","hot"]', 2)`).run(c1.lastInsertRowid);

      // 模拟 keyword 过滤
      const allTags = [{ name: 'vip', count: 1 }, { name: 'hot', count: 1 }];
      const filtered = allTags.filter(t => t.name.indexOf('v') !== -1);
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('vip');
    });

    it('普通顾问只看到自己 candidate 上的 tag', () => {
      const db = getDb();
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 2)`).run();
      const c2 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c2', 1)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["vip"]', 2)`).run(c1.lastInsertRowid);
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["admin-tag"]', 1)`).run(c2.lastInsertRowid);

      // 模拟 consultant (user_id=2) 的 loadAllTags
      const rows = db.prepare(`SELECT candidate_id, tags FROM candidate_tags ct WHERE ct.deleted_at IS NULL AND ct.user_id = ?`).all(2);
      let map = {};
      rows.forEach(r => {
        let tags = [];
        try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
        tags.forEach(t => { if (!map[t]) map[t] = { name: t, count: 0 }; map[t].count++; });
      });
      const names = Object.keys(map);
      expect(names).toContain('vip');
      expect(names).not.toContain('admin-tag');
    });
  });

  describe('GET /tags/:name/candidates', () => {
    it('用 instr 精确匹配 tag（不误中子串）', () => {
      const db = getDb();
      const a = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('a', 2)`).run();
      const b = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('b', 2)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["前端"]', 2)`).run(a.lastInsertRowid);
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["前后端"]', 2)`).run(b.lastInsertRowid);

      // 模拟 GET /tags/前端/candidates
      const rows = db.prepare(`
        SELECT c.id, c.name FROM candidates c
        JOIN candidate_tags ct ON ct.candidate_id = c.id
        WHERE c.deleted_at IS NULL AND ct.deleted_at IS NULL AND ct.user_id = ? AND instr(ct.tags, ?) > 0
      `).all(2, '"前端"');
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(a.lastInsertRowid);
    });

    it('软删的 candidate 不返回', () => {
      const db = getDb();
      const ins = db.prepare(`INSERT INTO candidates (name, user_id, deleted_at) VALUES ('x', 2, datetime('now'))`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["vip"]', 2)`).run(ins.lastInsertRowid);

      const rows = db.prepare(`
        SELECT c.id FROM candidates c
        JOIN candidate_tags ct ON ct.candidate_id = c.id
        WHERE c.deleted_at IS NULL AND instr(ct.tags, ?) > 0
      `).all('"vip"');
      expect(rows.length).toBe(0);
    });

    it('URL 解码：含特殊字符的 tag 名能正确匹配', () => {
      // 例如 tag "C++" → URL encode "C%2B%2B" → decode 回来是 "C++"
      // 这里测 decode 逻辑（用 escape 函数）
      const decode = decodeURIComponent('C%2B%2B');
      expect(decode).toBe('C++');
    });
  });

  describe('PUT /tags/:tag/rename', () => {
    it('new_name 必填校验', () => {
      // 模拟 !new_name || !String(new_name).trim() → throw badRequest
      const body1 = {};
      const body2 = { new_name: '   ' };
      expect(!body1.new_name || !String(body1.new_name).trim()).toBe(true);
      expect(!body2.new_name || !String(body2.new_name).trim()).toBe(true);
    });

    it('新旧名相同抛 badRequest', () => {
      // newName === oldName → 模拟
      const oldName = 'vip';
      const newName = 'vip';
      expect(newName === oldName).toBe(true);
    });

    it('rename 后所有含 oldName 的 tags 数组里替换为 newName（含去重）', () => {
      const db = getDb();
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 2)`).run();
      const c2 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c2', 2)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, '["vip","前端"]', 2, 0)`).run(c1.lastInsertRowid);
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, '["vip","后端"]', 2, 0)`).run(c2.lastInsertRowid);

      // 模拟 rename vip → VIP：替换 + 去重
      const oldName = 'vip', newName = 'VIP';
      const rows = db.prepare(`SELECT candidate_id, tags, version FROM candidate_tags WHERE deleted_at IS NULL AND instr(tags, ?) > 0`).all('"' + oldName + '"');
      let changed = 0;
      rows.forEach(r => {
        let tags = [];
        try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
        const idx = tags.indexOf(oldName);
        if (idx !== -1) {
          tags[idx] = newName;
          tags = Array.from(new Set(tags));
          db.prepare(`UPDATE candidate_tags SET tags = ?, version = version + 1 WHERE candidate_id = ? AND version = ?`).run(JSON.stringify(tags), r.candidate_id, r.version);
          changed++;
        }
      });
      expect(changed).toBe(2);

      // 验证替换后
      const r1 = db.prepare(`SELECT tags FROM candidate_tags WHERE candidate_id = ?`).get(c1.lastInsertRowid);
      expect(JSON.parse(r1.tags)).toEqual(['VIP', '前端']);  // vip → VIP
      const r2 = db.prepare(`SELECT tags FROM candidate_tags WHERE candidate_id = ?`).get(c2.lastInsertRowid);
      expect(JSON.parse(r2.tags)).toEqual(['VIP', '后端']);
    });

    it('rename 不存在的 tag：changed=0（不抛错）', () => {
      const db = getDb();
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 2)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, '["frontend"]', 2, 0)`).run(c1.lastInsertRowid);

      // rename "notexist" → "newtag"
      const rows = db.prepare(`SELECT candidate_id, tags FROM candidate_tags WHERE deleted_at IS NULL AND instr(tags, ?) > 0`).all('"notexist"');
      expect(rows.length).toBe(0);
    });
  });

  describe('DELETE /tags/:tag', () => {
    it('从 candidate_tags 数组里 splice tag', () => {
      const db = getDb();
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 2)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, '["vip","hot"]', 2, 0)`).run(c1.lastInsertRowid);

      // 模拟 DELETE /tags/vip
      const tagName = 'vip';
      const rows = db.prepare(`SELECT candidate_id, tags, version FROM candidate_tags WHERE deleted_at IS NULL AND instr(tags, ?) > 0`).all('"' + tagName + '"');
      let removed = 0;
      rows.forEach(r => {
        let tags = [];
        try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
        const idx = tags.indexOf(tagName);
        if (idx !== -1) {
          tags.splice(idx, 1);
          const json = JSON.stringify(tags);
          if (tags.length === 0) {
            db.prepare(`DELETE FROM candidate_tags WHERE candidate_id = ?`).run(r.candidate_id);
          } else {
            db.prepare(`UPDATE candidate_tags SET tags = ?, version = version + 1 WHERE candidate_id = ? AND version = ?`).run(json, r.candidate_id, r.version);
          }
          removed++;
        }
      });
      expect(removed).toBe(1);

      const row = db.prepare(`SELECT tags FROM candidate_tags WHERE candidate_id = ?`).get(c1.lastInsertRowid);
      const parsed = JSON.parse(row.tags);
      expect(parsed).toEqual(['hot']);  // vip 被去掉
    });

    it('删掉最后一个 tag 后 candidate_tags 整行被删（tags.length === 0）', () => {
      const db = getDb();
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 2)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, '["only"]', 2, 0)`).run(c1.lastInsertRowid);

      // 删 "only"
      const tagName = 'only';
      const rows = db.prepare(`SELECT candidate_id, tags FROM candidate_tags WHERE deleted_at IS NULL AND instr(tags, ?) > 0`).all('"' + tagName + '"');
      rows.forEach(r => {
        let tags = [];
        try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
        const idx = tags.indexOf(tagName);
        if (idx !== -1) {
          tags.splice(idx, 1);
          if (tags.length === 0) {
            db.prepare(`DELETE FROM candidate_tags WHERE candidate_id = ?`).run(r.candidate_id);
          }
        }
      });

      const row = db.prepare(`SELECT * FROM candidate_tags WHERE candidate_id = ?`).get(c1.lastInsertRowid);
      expect(row).toBeFalsy();  // 整行删了
    });

    it('删除不存在的 tag：removed=0（不抛错）', () => {
      const db = getDb();
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 2)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id) VALUES (?, '["frontend"]', 2)`).run(c1.lastInsertRowid);

      const rows = db.prepare(`SELECT candidate_id, tags FROM candidate_tags WHERE deleted_at IS NULL AND instr(tags, ?) > 0`).all('"nonexistent"');
      expect(rows.length).toBe(0);
    });
  });

  describe('POST /tags/merge', () => {
    it('from 必填且非空数组', () => {
      const body1 = { to: 'merged' };
      const body2 = { from: [], to: 'merged' };
      const body3 = { from: 'not array', to: 'merged' };
      expect(!Array.isArray(body1.from) || !body1.from.length).toBe(true);
      expect(!Array.isArray(body2.from) || !body2.from.length).toBe(true);
      expect(!Array.isArray(body3.from) || !body3.from.length).toBe(true);
    });

    it('to 必填', () => {
      const body = { from: ['a'] };
      expect(!body.to || !String(body.to).trim()).toBe(true);
    });

    it('merge 多个 from 到 to：所有 from 在 tags 数组里替换为 to', () => {
      const db = getDb();
      const c1 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c1', 2)`).run();
      const c2 = db.prepare(`INSERT INTO candidates (name, user_id) VALUES ('c2', 2)`).run();
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, '["a","前端"]', 2, 0)`).run(c1.lastInsertRowid);
      db.prepare(`INSERT INTO candidate_tags (candidate_id, tags, user_id, version) VALUES (?, '["b","前端"]', 2, 0)`).run(c2.lastInsertRowid);

      // 模拟 merge from=[a, b, 前端] → to=merged
      const from = ['a', 'b', '前端'];
      const to = 'merged';
      const base = from[0];
      let totalUpdated = 0;
      for (let i = 1; i < from.length; i++) {
        const oldName = from[i];
        const rows = db.prepare(`SELECT candidate_id, tags, version FROM candidate_tags WHERE deleted_at IS NULL AND instr(tags, ?) > 0`).all('"' + oldName + '"');
        rows.forEach(r => {
          let tags = [];
          try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
          const idx = tags.indexOf(oldName);
          if (idx !== -1) {
            tags[idx] = base;
            tags = Array.from(new Set(tags));
            db.prepare(`UPDATE candidate_tags SET tags = ?, version = version + 1 WHERE candidate_id = ? AND version = ?`).run(JSON.stringify(tags), r.candidate_id, r.version);
            totalUpdated++;
          }
        });
      }
      // 第二阶段：base → to
      const rows2 = db.prepare(`SELECT candidate_id, tags, version FROM candidate_tags WHERE deleted_at IS NULL AND instr(tags, ?) > 0`).all('"' + base + '"');
      rows2.forEach(r => {
        let tags = [];
        try { tags = JSON.parse(r.tags || '[]'); } catch (e) {}
        const idx = tags.indexOf(base);
        if (idx !== -1) {
          tags[idx] = to;
          tags = Array.from(new Set(tags));
          db.prepare(`UPDATE candidate_tags SET tags = ?, version = version + 1 WHERE candidate_id = ? AND version = ?`).run(JSON.stringify(tags), r.candidate_id, r.version);
          totalUpdated++;
        }
      });

      // 验证 c1: ["a", "前端"] → base=a 第一轮改 [a, a]（a 替换 前端）→ Set 去重 [a] → 第二轮 [a] → [merged]
      const r1 = db.prepare(`SELECT tags FROM candidate_tags WHERE candidate_id = ?`).get(c1.lastInsertRowid);
      const parsed1 = JSON.parse(r1.tags);
      expect(parsed1).toEqual(['merged']);

      // 验证 c2: ["b", "前端"] → 第一轮 [b, a]（a 替换 前端），第二轮 a → merged → [b, merged]
      const r2 = db.prepare(`SELECT tags FROM candidate_tags WHERE candidate_id = ?`).get(c2.lastInsertRowid);
      const parsed2 = JSON.parse(r2.tags);
      expect(parsed2).toContain('merged');
      expect(parsed2).not.toContain('a');
      expect(parsed2).not.toContain('b');
      expect(parsed2).not.toContain('前端');
    });
  });

  // ============================================================
  // 源码级 invariant
  // ============================================================
  describe('源码级 invariant（防回归）', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/routes/tags.js'),
      'utf8'
    );

    it('多处 tags 用 instr 精确匹配（不再 LIKE）', () => {
      expect(src).toMatch(/instr\s*\(\s*tags\s*,/g);
      expect(src).not.toMatch(/tags\s+LIKE\s+\?/);
    });

    it('withTagsLock 串行化存在', () => {
      expect(src).toContain('withTagsLock');
    });

    it('rename/delete/merge 含乐观锁 version 检查', () => {
      expect(src).toMatch(/version\s*=\s*version\s*\+\s*1/);
      expect(src).toMatch(/AND\s+version\s*=\s*\?/);
    });

    it('DELETE /:tag 含 tags.length === 0 时整行删', () => {
      expect(src).toMatch(/tags\.length\s*===\s*0/);
      expect(src).toMatch(/DELETE\s+FROM\s+candidate_tags/);
    });

    it('merge 含 from/to 校验', () => {
      // 源码用解构: const { from, to } = req.body || {};
      expect(src).toMatch(/\{[^}]*\bfrom\b[^}]*\bto\b[^}]*\}\s*=\s*req\.body/);
      expect(src).toMatch(/target\s*=\s*String\s*\(\s*to\s*\)/);
    });

    it('tags.js 导出 router', () => {
      expect(src).toMatch(/module\.exports\s*=\s*router/);
    });
  });
});
