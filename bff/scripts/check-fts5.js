// bff/scripts/check-fts5.js
// 独立 FTS5 可用性检测（CI + 本地可跑）
// Phase 1: 改用 better-sqlite3（同步 API + 内置 FTS5）
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'package.json'),
  'utf8'
));
console.log('better-sqlite3 version:', pkg.version);

const db = new Database(':memory:');
let ftsAvailable = false;
let errMsg = '';
try {
  db.exec(`CREATE VIRTUAL TABLE candidates_fts USING fts5(name)`);
  db.prepare(`INSERT INTO candidates_fts(name) VALUES ('test')`).run();
  const r = db.prepare(`SELECT * FROM candidates_fts WHERE candidates_fts MATCH 'test*'`).get();
  ftsAvailable = !!r;
} catch (e) {
  errMsg = e.message;
}
db.close();

if (ftsAvailable) {
  console.log('✅ FTS5 available');
  process.exit(0);
} else {
  console.log('❌ FTS5 NOT available' + (errMsg ? ' (' + errMsg + ')' : ''));
  console.log('   Fallback: LIKE 全表扫 + 复合索引（idempotent）');
  process.exit(1);
}
