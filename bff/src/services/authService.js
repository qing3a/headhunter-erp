const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/init');
const { getConfig } = require('../config/env');
const { ApiError, notFound, duplicate, unauthorized } = require('../utils/errors');

const BCRYPT_ROUNDS = 10;

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(user) {
  const { jwtSecret, jwtExpiresIn } = getConfig();
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function verifyToken(token) {
  const { jwtSecret } = getConfig();
  return jwt.verify(token, jwtSecret);
}

async function createUser({ username, password, displayName, role }) {
  const db = getDb();
  if (!username || !password) {
    throw new ApiError('VALIDATION_ERROR', '用户名和密码不能为空');
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    throw duplicate('用户名已存在');
  }
  const hash = await hashPassword(password);
  const r = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role)
    VALUES (?, ?, ?, ?)
  `).run(username, hash, displayName || username, role || 'consultant');
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  return publicUser(row);
}

async function findUserByUsername(username) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

async function findUserById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

async function listUsers() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
  return rows.map(publicUser);
}

async function login(username, password) {
  const user = await findUserByUsername(username);
  if (!user) throw unauthorized('用户名或密码错误');
  if (user.status && user.status !== 'active') throw unauthorized('账号已停用');
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw unauthorized('用户名或密码错误');
  const db = getDb();
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  const token = signToken(user);
  return { token, user: publicUser(user) };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  createUser,
  findUserByUsername,
  findUserById,
  listUsers,
  login,
  publicUser,
};
