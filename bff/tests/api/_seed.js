// bff/tests/api/_seed.js
// 用 INSERT OR REPLACE 兼容 init.js 的默认 seed
import bcrypt from 'bcryptjs';

const adminHash = bcrypt.hashSync('admin123', 10);
const demoHash = bcrypt.hashSync('demo123', 10);

export function seedAdmin(db) {
  db.prepare(`INSERT OR REPLACE INTO users (id, username, password_hash, role, display_name, status) VALUES (1, 'admin', ?, 'admin', 'Admin', 'active')`).run(adminHash);
}

export function seedConsultant(db) {
  db.prepare(`INSERT OR REPLACE INTO users (id, username, password_hash, role, display_name, status) VALUES (2, 'demo', ?, 'consultant', 'Demo', 'active')`).run(demoHash);
}
