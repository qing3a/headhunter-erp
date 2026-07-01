const path = require('path');

function loadEnv() {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

function read(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v;
}

function bool(v, fallback) {
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function getConfig() {
  loadEnv();
  const jwtSecret = read('JWT_SECRET', 'dev-secret-please-change-32chars-minimum');
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters');
  }
  // ===== P1-3 修复：CORS 白名单 =====
  const corsOriginsRaw = read('CORS_ORIGINS', 'http://localhost:3001,http://127.0.0.1:3001');
  const corsOrigins = corsOriginsRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  // ===== 修复结束 =====
  return {
    port: parseInt(read('PORT', '3001'), 10),
    nodeEnv: read('NODE_ENV', 'development'),
    jwtSecret,
    jwtExpiresIn: read('JWT_EXPIRES_IN', '7d'),
    platformApiBase: read('PLATFORM_API_BASE', ''),
    platformAdminKey: read('PLATFORM_ADMIN_KEY', ''),
    dbPath: read('DB_PATH', './data/erp.db'),
    demoSeed: bool(read('DEMO_SEED'), true),
    corsOrigins: corsOrigins,
  };
}

module.exports = { getConfig, loadEnv };
