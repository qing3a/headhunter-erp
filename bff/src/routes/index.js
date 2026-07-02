const express = require('express');

const router = express.Router();

const { success } = require('../utils/response');

router.get('/health', (req, res) => {
  res.json(success({
    status: 'running',
    time: new Date().toISOString(),
    version: '0.2.0',
  }));
});

router.use('/auth', require('./auth'));
router.use('/dashboard', require('./dashboard'));
router.use('/candidates', require('./candidates'));
router.use('/jobs', require('./jobs'));
router.use('/recommendations', require('./recommendations'));
router.use('/interviews', require('./interviews'));
router.use('/tasks', require('./tasks'));
router.use('/tags', require('./tags'));
router.use('/reports', require('./reports'));
router.use('/imports', require('./imports'));
router.use('/clients', require('./clients'));
// ===== v8 新增：AI 匹配路由 =====
router.use('/ai-matching', require('./aiMatching'));

module.exports = router;
