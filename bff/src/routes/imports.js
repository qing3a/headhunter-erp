const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { badRequest } = require('../utils/errors');
const auditService = require('../services/auditService');
const asyncHandler = require('../utils/asyncHandler');
const importService = require('../services/importService');

const router = express.Router();
router.use(requireAuth);

// ===== P1-4 修复：multer 导入限流（每用户 1 小时 10 次）=====
// 防止恶意用户循环发 5MB 文件撑爆内存
const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // 用 ipKeyGenerator 包装 IP（express-rate-limit 8.x 要求），
  // 已登录用户按 user.id 限流；未登录兜底用 IP（走 ipKeyGenerator 防 IPv6 绕过）
  keyGenerator: function (req) {
    if (req.user && req.user.id) return 'import_user_' + req.user.id;
    // 未登录（路由 requireAuth 应挡住，这里是兜底）
    return 'import_ip_' + ipKeyGenerator(req.ip);
  },
  message: { ok: false, error: { code: 'RATE_LIMITED', message: '导入过于频繁，请 1 小时后再试' } }
});
// ===== 修复结束 =====

// multer 用内存存储（5MB 限制）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ===== 关键修复：multer 错误处理中间件 =====
// 上传超过 5MB 或其他 multer 错误时，不再返回 500 INTERNAL_ERROR，
// 而是返回 400 VALIDATION_ERROR 带明确错误信息。
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '文件超过 5MB 限制' }
      });
    }
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: '上传失败：' + err.message }
    });
  }
  next(err);
}
// ===== 修复结束 =====

/**
 * GET /api/v1/imports/template
 * 下载标准 Excel 模板
 */
router.get('/template', asyncHandler(async (req, res) => {
  const buffer = await importService.generateTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="candidates_template.xlsx"');
  res.send(buffer);
}));

/**
 * POST /api/v1/imports/preview
 * 接收 multipart 文件，返回表头 + 前 5 行预览 + 建议字段映射
 */
router.post('/preview', importLimiter, upload.single('file'), handleUploadError, asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('请上传文件');
  const preview = await importService.parsePreview(req.file.buffer, 5);
  res.json(success(preview));
}));

/**
 * POST /api/v1/imports/commit
 * 接收 multipart 文件 + 字段映射 JSON，写入 candidates
 * body: file + mapping (JSON 字符串: {"姓名": "name", "手机号": "phone", ...})
 */
router.post('/commit', importLimiter, upload.single('file'), handleUploadError, asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('请上传文件');
  let mapping = {};
  try {
    mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {};
  } catch (e) {
    throw badRequest('字段映射 JSON 格式错误：' + e.message);
  }
  // ===== v7.5 Bug 1 修复：mapping={} 必须抛 400 而非落到 service 抛 500 =====
  if (!mapping || typeof mapping !== 'object' || Object.keys(mapping).length === 0) {
    throw badRequest('字段映射不能为空');
  }

  const skipDuplicates = req.body.skipDuplicates !== 'false'; // 默认 true
  try {
    const result = await importService.commitImport(req.file.buffer, mapping, req.user.id, { skipDuplicates: skipDuplicates });
    auditService.log(req.user.id, 'IMPORT_candidates', 'candidate', null, result, req.ip);
    res.json(success(result));
  } catch (e) {
    // ===== v7.5 Bug 2 修复：非 Excel / JSZip 错误 → 400 而不是 500 =====
    const msg = String(e.message || '');
    if (/zip|file|excel|xlsx|invalid|format|corrupt|signature/i.test(msg)) {
      throw badRequest('文件格式错误：必须是 .xlsx 或 .xls');
    }
    throw e;  // 其他错让全局 handler 处理
  }
}));

module.exports = router;
