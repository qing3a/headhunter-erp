// bff/tests/api/openapi.test.js
// v9.0-delta: OpenAPI spec + Swagger UI serving (8 tests)

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { setupTests } from './_helpers.js';
import openapiRouter from '../../src/routes/openapi.js';

setupTests();

function makeApp() {
  const app = express();
  app.use(openapiRouter);
  return app;
}

describe('OpenAPI / Swagger UI (v9.0-delta)', () => {
  it('1. GET /api/v1/openapi.json → 200 + valid OpenAPI 3.0 JSON', async () => {
    const app = makeApp();
    const r = await request(app).get('/api/v1/openapi.json');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.body.openapi).toBe('3.0.3');
    expect(r.body.info.title).toBe('headhunter-api-hub');
    expect(typeof r.body.paths).toBe('object');
  });

  it('2. GET /api/docs → 200 HTML containing swagger-ui', async () => {
    const app = makeApp();
    const r = await request(app).get('/api/docs');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.text).toContain('swagger-ui');
    expect(r.text).toContain('/api/v1/openapi.json');
  });

  it('3. spec 包含所有预期的 tags (Auth/Candidates/Jobs/...)', async () => {
    const app = makeApp();
    const r = await request(app).get('/api/v1/openapi.json');
    const tagNames = r.body.tags.map(t => t.name);
    expect(tagNames).toEqual(expect.arrayContaining([
      'Auth', 'Candidates', 'Jobs', 'Clients', 'Recommendations',
      'Reports', 'Imports', 'AI Matching',
    ]));
  });

  it('4. spec 包含 securitySchemes: BearerAuth + ApiKeyAuth', async () => {
    const app = makeApp();
    const r = await request(app).get('/api/v1/openapi.json');
    expect(r.body.components.securitySchemes.BearerAuth).toBeDefined();
    expect(r.body.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
    expect(r.body.components.securitySchemes.ApiKeyAuth).toBeDefined();
    expect(r.body.components.securitySchemes.ApiKeyAuth.type).toBe('apiKey');
  });

  it('5. 注解路由 (POST /api/v1/auth/login) summary 来自 @openapi-summary', async () => {
    const app = makeApp();
    const r = await request(app).get('/api/v1/openapi.json');
    const loginEntry = r.body.paths['/api/v1/auth/login']?.post;
    expect(loginEntry).toBeDefined();
    expect(loginEntry.summary).toContain('登录');
    expect(loginEntry.summary).not.toMatch(/^\[/); // 不是 skeleton summary
  });

  it('6. skeleton 路由 (未定 @openapi 的) summary 是 placeholder', async () => {
    const app = makeApp();
    const r = await request(app).get('/api/v1/openapi.json');
    // 找一个没注解的路由 — POST /candidates 是常被加但暂未注
    const candidatesPost = r.body.paths['/api/v1/candidates']?.post;
    if (candidatesPost) {
      // 没注解 → summary 以 [POST] 开头
      expect(candidatesPost.summary).toMatch(/^\[POST\]/);
    }
    // 至少有 50 个 skeleton endpoint 提醒开发者去注解
    let skeletonCount = 0;
    for (const methods of Object.values(r.body.paths)) {
      for (const entry of Object.values(methods)) {
        if (entry.summary && entry.summary.startsWith('[')) skeletonCount++;
      }
    }
    expect(skeletonCount).toBeGreaterThan(30);
  });

  it('7. GET /openapi 重定向到 /api/docs', async () => {
    const app = makeApp();
    const r = await request(app).get('/openapi');
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/api/docs');
  });

  it('8. openapi.json 与生成器输出一致 (CI 验证 generator deterministic)', () => {
    // 直接 require 生成器函数, 跑两次验证输出相等
    // 不通过 execSync (vitest env 里 cmd.exe 不可用)
    const genPath = path.join(__dirname, '..', '..', 'scripts', 'generate-openapi.js');
    delete require.cache[genPath]; // 防止 cache
    const specPath = path.join(__dirname, '..', '..', 'openapi.json');
    const before = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : null;
    // 调用 generator: 它会 write 到 OUTPUT
    require(genPath);
    const after1 = fs.readFileSync(specPath, 'utf8');
    // 再跑一次
    delete require.cache[genPath];
    require(genPath);
    const after2 = fs.readFileSync(specPath, 'utf8');
    expect(after1).toBe(after2);
    // 还原之前的状态
    if (before !== null) fs.writeFileSync(specPath, before);
  });
});
