// bff/src/routes/openapi.js
// v9.0-delta: serve OpenAPI 3.0 spec + Swagger UI
//
// Endpoints:
//   GET /api/v1/openapi.json  — 静态读 bff/openapi.json
//   GET /api/docs             — Swagger UI HTML (CDN)
//   GET /api/docs/openapi.json — redirect 到 /api/v1/openapi.json

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const SPEC_PATH = path.join(__dirname, '..', '..', 'openapi.json');

// 1) OpenAPI JSON spec (under both /api/v1 and /api/docs for Swagger UI to find)
router.get('/api/v1/openapi.json', (req, res) => {
  try {
    const spec = fs.readFileSync(SPEC_PATH, 'utf8');
    res.type('application/json').send(spec);
  } catch (e) {
    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'openapi.json 缺失, 跑 `npm run openapi:generate`' } });
  }
});

// 2) Swagger UI HTML 页面 (CDN)
router.get('/api/docs', (req, res) => {
  res.type('text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>API Docs — headhunter-api-hub</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>body { margin: 0 }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
        requestInterceptor: (req) => {
          // 让 supertest "Try it out" 自动加上 Bearer
          const t = localStorage.getItem('jwt_token');
          if (t) req.headers['Authorization'] = 'Bearer ' + t;
          return req;
        },
      });
    };
  </script>
</body>
</html>`);
});

// 3) Swagger UI 内部用的 openapi.json (避免跨域)
router.get('/api/docs/openapi.json', (req, res) => res.redirect('/api/v1/openapi.json'));

// 4) /openapi 简化 alias
router.get('/openapi', (req, res) => res.redirect('/api/docs'));

module.exports = router;
