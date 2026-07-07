// bff/scripts/create-api-key.js
// v9.0-gamma: CLI 给一个 client_name 签发 API key
// 用法：
//   node bff/scripts/create-api-key.js <client_name> [--scopes read:candidates,read:jobs] [--user-id 1]
// 输出：一次性明文 key (只能看这一次)

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { init, getDb } = require('../src/db/init');

function parseArgs(argv) {
  const args = { client_name: null, scopes: [], user_id: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--scopes' && argv[i + 1]) {
      args.scopes = argv[i + 1].split(',').map(s => s.trim()).filter(Boolean);
      i++;
    } else if (argv[i] === '--user-id' && argv[i + 1]) {
      args.user_id = parseInt(argv[i + 1], 10);
      i++;
    } else if (!args.client_name) {
      args.client_name = argv[i];
    }
  }
  return args;
}

function generateKey() {
  // 32 字节随机 + base64url ≈ 43 char, 前缀 hha_ 易于识别 (HeadHunter API)
  const raw = crypto.randomBytes(32).toString('base64url');
  return `hha_${raw}`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.client_name) {
    console.error('Usage: node create-api-key.js <client_name> [--scopes read:candidates,read:jobs] [--user-id N]');
    process.exit(1);
  }

  init();
  const db = getDb();
  const plain = generateKey();
  const prefix = plain.slice(0, 8);
  const hashed = bcrypt.hashSync(plain, 10);

  const r = db.prepare(`
    INSERT INTO api_keys (client_name, key_prefix, hashed_key, scopes, user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(args.client_name, prefix, hashed, JSON.stringify(args.scopes), args.user_id);

  console.log('\n✅ API key 已签发（仅显示一次，请妥善保存）：');
  console.log('─────────────────────────────────────────────');
  console.log(`  client_name : ${args.client_name}`);
  console.log(`  scopes      : ${JSON.stringify(args.scopes)}`);
  console.log(`  user_id     : ${args.user_id || '(null = admin default)'}`);
  console.log(`  id (db)     : ${r.lastInsertRowid}`);
  console.log(`  prefix      : ${prefix}`);
  console.log(`  key (plain) : ${plain}`);
  console.log('─────────────────────────────────────────────');
  console.log('使用方式：');
  console.log(`  curl -H "Authorization: ApiKey ${plain}" http://localhost:3001/api/v1/candidates\n`);
  console.log('撤销方式：');
  console.log(`  SQL: UPDATE api_keys SET revoked_at = datetime('now') WHERE client_name = '${args.client_name}';\n`);
}

main();
