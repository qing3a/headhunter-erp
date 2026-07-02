// bff/scripts/check-fts5.js
// 独立 FTS5 可用性检测（CI + 本地可跑）
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  // 从 sql.js package.json 读版本
  const pkg = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'node_modules', 'sql.js', 'package.json'),
    'utf8'
  ));
  console.log('SQL.js version:', pkg.version);

  const SQL = await initSqlJs();
  const db = new SQL.Database();
  let ftsAvailable = false;
  let errMsg = '';
  try {
    db.run(`CREATE VIRTUAL TABLE candidates_fts USING fts5(name)`);
    db.run(`INSERT INTO candidates_fts(name) VALUES ('test')`);
    const r = db.exec(`SELECT * FROM candidates_fts WHERE candidates_fts MATCH 'test*'`);
    ftsAvailable = r.length > 0 && r[0].values.length > 0;
  } catch (e) {
    errMsg = e.message;
  }
  if (ftsAvailable) {
    console.log('✅ FTS5 available');
    process.exit(0);
  } else {
    console.log('❌ FTS5 NOT available' + (errMsg ? ' (' + errMsg + ')' : ''));
    console.log('   Fallback: LIKE 全表扫 + 复合索引（idempotent）');
    process.exit(1);
  }
})();