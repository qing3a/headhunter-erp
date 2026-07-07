// bff/src/routes/landing.js
// v9.0-beta: GET / — API landing JSON
// 之前 GET / 是 redirect(/pages/dashboard.html) — 现在 serve 静态 JSON 给协作者

const express = require('express');

const router = express.Router();

const PKG = require('../../package.json');

router.get('/', (req, res) => {
  res.json({
    ok: true,
    data: {
      name: PKG.name,
      version: PKG.version,
      description: PKG.description || 'Headhunter API hub — centralized data store for candidate / job / recommendation workflows',
      api: {
        base: '/api/v1',
        health: '/api/v1/health',
        openapi: '/api/v1/openapi.json',
        docs: '/api/docs',
      },
      auth: {
        methods: ['JWT (Authorization: Bearer <jwt>)', 'API Key (Authorization: ApiKey <key>)'],
        login: 'POST /api/v1/auth/login',
      },
      clients: {
        note: 'Designed for collaboration with sibling projects (AI agents, ow-headhunter-erp, custom clients)',
      },
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
