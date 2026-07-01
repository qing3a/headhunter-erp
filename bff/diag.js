const fs = require('fs');
const Database = require('sql.js');
(async () => {
  const SQL = await Database();
  const db = new SQL.Database();
  const initCode = fs.readFileSync('./src/db/init.js', 'utf8');
  // 提取所有 db.exec 块（不区分引号类型）
  const execRe = /db\.exec\(`([\s\S]*?)`\)/g;
  const execMatches = [...initCode.matchAll(execRe)];
  console.log('found', execMatches.length, 'db.exec calls');
  for (let i = 0; i < execMatches.length; i++) {
    const block = execMatches[i][1];
    try {
      db.exec(block);
      console.log('block', i, 'OK, length=', block.length);
    } catch (e) {
      console.log('block', i, 'FAIL:', e.message);
      const lines = block.split('\n');
      for (let j = 0; j < lines.length; j++) {
        if (lines[j].indexOf('/') >= 0) {
          console.log('  /@line', j, ':', lines[j].substring(0, 200));
        }
      }
    }
  }
})();
