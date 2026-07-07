// bff/tests/api/_helpers.js
// supertest 集成测试基础设施
import express from 'express';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach } from 'vitest';
import { loadEnv, getConfig } from '../../src/config/env.js';
import { init, getDb, isReady } from '../../src/db/init.js';
import { seedAdmin, seedConsultant } from './_seed.js';

// 确保 dotenv 加载（jwtSecret 来自 .env）
loadEnv();

function signTestJwt(role = 'admin') {
  const { jwtSecret } = getConfig();
  const id = role === 'admin' ? 1 : 2;
  const username = role === 'admin' ? 'admin' : 'demo';
  return jwt.sign({ id, username, role }, jwtSecret);
}

// 在 router 前注入 Bearer token，让 route 的 requireAuth 通过
function attachTestToken(role = 'admin') {
  const token = signTestJwt(role);
  return (req, res, next) => {
    req.headers.authorization = 'Bearer ' + token;
    next();
  };
}

// 在 mount path 注入 token；router 的相对路径（如 '/'）保持不变
// 用法：createTestApp('/api/v1/jobs', router)           -> jobs 路由 mount 在完整路径
//       createTestApp('/api/v1/auth', router, 'consultant')
export function createTestApp(mountPath, router, role = 'admin') {
  const app = express();
  app.use(express.json());
  // 注意：mountPath 必须包含完整路径（如 /api/v1/jobs），
  // 这样 router 内 router.get('/') 才能匹配 mountPath + '/' 即 /api/v1/jobs
  app.use(mountPath, attachTestToken(role), router);
  // 全局 error handler（兜底）
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      ok: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  });
  return app;
}

// setup：每个 test file 顶部调
export async function setupTests() {
  beforeAll(async () => {
    if (!isReady()) await init();
  });
  beforeEach(() => {
    const db = getDb();
    db.exec(`
      DELETE FROM audit_log;
      DELETE FROM recommendation_status_history;
      DELETE FROM candidate_tags;
      DELETE FROM candidate_experiences;
      DELETE FROM candidate_educations;
      DELETE FROM candidate_contacts;
      DELETE FROM recommendations;
      DELETE FROM candidates;
      DELETE FROM client_notes;
      DELETE FROM clients;
      DELETE FROM interviews;
      DELETE FROM tasks;
      DELETE FROM jobs;
      DELETE FROM api_keys;
      DELETE FROM users;
    `);
    seedAdmin(db);
    seedConsultant(db);
  });
}
