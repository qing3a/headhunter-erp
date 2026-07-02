require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { getConfig } = require('./config/env');
const db = require('./db/init');
const routes = require('./routes');
const auditService = require('./services/auditService');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { fail } = require('./utils/response');

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err && err.message ? err.message : err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.message ? err.message : err);
});

const config = getConfig();
const app = express();

const projectRoot = path.resolve(__dirname, '..', '..');

// ===== P0-NEW-1 修复：trust proxy 限制为 loopback，避免伪造 X-Forwarded-For =====
app.set('trust proxy', 'loopback');
// ===== 修复结束 =====

app.use('/shared', express.static(path.join(projectRoot, 'shared'), { maxAge: '1h' }));
app.use('/partials', express.static(path.join(projectRoot, 'partials'), { maxAge: '1h' }));
// Phase 3: esbuild 输出优先（bff/public/pages），原 pages 目录作为 fallback
app.use('/pages', express.static(path.join(__dirname, '..', 'public', 'pages'), { maxAge: '1h', extensions: ['html'] }));
app.use('/pages', express.static(path.join(projectRoot, 'pages'), { maxAge: 0, extensions: ['html'] }));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  // ===== P1-3 修复：CORS 白名单（从环境变量读，origin 函数逐个判断）=====
  origin: function (origin, cb) {
    // 同源 / 无 origin（curl / server-to-server）放行
    if (!origin) return cb(null, true);
    if (config.corsOrigins && config.corsOrigins.indexOf(origin) !== -1) return cb(null, true);
    return cb(new Error('CORS not allowed: ' + origin));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// ===== 修复结束 =====

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (config.nodeEnv !== 'test') {
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
}

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: fail('RATE_LIMITED', '请求过于频繁，请稍后再试'),
});
app.use('/api/', apiLimiter);

app.get('/', (req, res) => {
  res.redirect('/pages/dashboard.html');
});

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

// init() 现在是同步（better-sqlite3）
try {
  db.init();

  app.listen(config.port, () => {
    console.log(`\n🚀 ERP BFF running on http://localhost:${config.port}`);
    console.log(`📊 API base: http://localhost:${config.port}/api/v1`);
    console.log(`🔗 Platform API: ${config.platformApiBase || 'not configured'}`);
    console.log(`🌍 Env: ${config.nodeEnv}`);
    console.log(`👤 Default users: admin/admin123, demo/demo123\n`);
  });

  // v1.1: BFF 启动时扫描过期的推荐（3 天前推荐无反馈 → pending_feedback + 创建跟进 task）
  // 可通过 REMINDER_SCAN=false 关闭（生产用外部 cron 调度）
  if (String(process.env.REMINDER_SCAN || 'true').toLowerCase() !== 'false') {
    // ===== P0-NEW-3 修复：scanOverdueRecommendations 现在是 Promise + mutex 串行化 =====
    Promise.resolve().then(async () => {
      try {
        const recRouter = require('./routes/recommendations');
        const result = await recRouter.scanOverdueRecommendations();
        if (result.processed > 0) {
          console.log(`⏰ Reminder scan: ${result.processed} overdue recommendation(s) processed, ${result.tasks_created} follow-up task(s) created`);
        } else {
          console.log(`⏰ Reminder scan: 0 overdue (all clear)`);
        }
      } catch (e) {
        console.error('Reminder scan failed:', e.message);
      }
    });
  } else {
    console.log('⏰ Reminder scan: skipped (REMINDER_SCAN=false)');
  }

  // ===== P0-4 修复：审计日志自动清理 =====
  // 删除 N 天前的 audit_log 记录。可通过 AUDIT_RETENTION_DAYS 调整（默认 90 天）。
  // 设置为 0 或负数可禁用；设置 AUDIT_RETENTION=false 完全跳过清理。
  if (String(process.env.AUDIT_RETENTION || 'true').toLowerCase() === 'false') {
    console.log('🧹 Audit cleanup: skipped (AUDIT_RETENTION=false)');
  } else {
    try {
      const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '90');
      if (retentionDays > 0) {
        const removed = auditService.cleanupOldAudit(retentionDays);
        if (removed > 0) {
          console.log(`🧹 Audit cleanup: removed ${removed} old records (>${retentionDays} days)`);
        } else {
          console.log(`🧹 Audit cleanup: 0 records to remove (retention=${retentionDays}d)`);
        }
      } else {
        console.log('🧹 Audit cleanup: skipped (retention <= 0)');
      }
    } catch (e) {
      console.error('Audit cleanup failed:', e.message);
    }
  }
  // ===== 修复结束 =====
} catch (err) {
  console.error('Failed to initialize database:', err);
  process.exit(1);
}

module.exports = app;
