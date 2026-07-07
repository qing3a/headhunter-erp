// bff/scripts/generate-openapi.js
// v9.0-delta: OpenAPI 3.0.3 spec 生成器
//
// 流程：
//   1. 扫 src/routes/*.js, 用 regex 提取 router.<method>('<path>'...) 行
//   2. 对每个路由, 查上面的 JSDoc 注释里有没有 @openapi {<method>} <path> <summary>
//   3. 有注解 -> 用注解里的 summary/tags/description 丰富 spec
//      无注解 -> 生成 skeleton (method, path, tags, summary='待补充')
//   4. 合并写入 bff/openapi.json
//
// 用法:
//   node scripts/generate-openapi.js                       # 默认写到 bff/openapi.json
//   node scripts/generate-openapi.js --check               # CI mode: 比对现有 openapi.json
//   node scripts/generate-openapi.js --check --strict      # 任何差异都 exit 1

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'src', 'routes');
const OUTPUT = path.join(__dirname, '..', 'openapi.json');

function listRouteFiles(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'index.js').map(f => path.join(dir, f));
}

function extractRoutes(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const routes = [];
  const lines = content.split('\n');
  let pendingJSDoc = null;

  const ROUTE_LINE = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 收集多行 JSDoc
    if (line.trim().endsWith('*/')) {
      // 找最近的 /** 起始
      let j = i - 1;
      const collected = [];
      while (j >= 0) {
        collected.unshift(lines[j]);
        if (lines[j].trim().startsWith('/**')) break;
        j--;
      }
      pendingJSDoc = collected.join('\n');
      continue;
    }
    const m = line.match(ROUTE_LINE);
    if (m) {
      const [, method, urlPath] = m;
      const routeInfo = parseOpenApiJSDoc(pendingJSDoc);
      routes.push({
        file: path.basename(filePath),
        line: i + 1,
        method: method.toUpperCase(),
        path: urlPath,
        summary: routeInfo.summary || '',
        tags: routeInfo.tags || [],
        description: routeInfo.description || '',
        security: routeInfo.security !== false ? ['BearerAuth', 'ApiKeyAuth'] : [],
      });
      pendingJSDoc = null;
    }
  }
  return routes;
}

function parseOpenApiJSDoc(jsdoc) {
  if (!jsdoc) return {};
  const result = {};
  const summary = jsdoc.match(/@openapi-summary\s+(.+?)(?:\n|\*\/|$)/m);
  if (summary) result.summary = summary[1].trim();
  const desc = jsdoc.match(/@openapi-description\s+([\s\S]+?)(?:\n\s*\*\s*@|$)/);
  if (desc) result.description = desc[1].trim();
  const tags = jsdoc.match(/@openapi-tags\s+(.+?)(?:\n|\*\/|$)/m);
  if (tags) result.tags = tags[1].split(',').map(t => t.trim()).filter(Boolean);
  if (/@openapi-noauth/i.test(jsdoc)) result.security = false;
  return result;
}

// ===== 简易错误响应 schema =====
const errorResponseSchema = (code) => ({
  description: `${code} response`,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiError' },
    },
  },
});

function buildOpenApi(routes, packageJson) {
  // 按 tag 分组路由 (粗分: 文件名 = tag)
  const paths = {};
  for (const r of routes) {
    let fullPath = (r.file === 'index.js' ? '' : `/api/v1/${r.file.replace('.js', '')}`) + r.path;
    // 去掉末尾斜杠 (除了根路径)
    if (fullPath.length > 1 && fullPath.endsWith('/')) fullPath = fullPath.slice(0, -1);
    if (!fullPath.startsWith('/api/v1/')) continue;
    const tags = r.tags.length ? r.tags : [deriveTag(r.file)];
    const entry = {
      tags,
      summary: r.summary || `[${r.method}] ${r.path}`,
      description: r.description || `由 ${r.file}:${r.line} 处理`,
      responses: {
        401: errorResponseSchema('Unauthorized'),
      },
    };
    if (r.security.length > 0) entry.security = r.security.map(s => ({ [s]: [] }));
    if (['POST', 'PUT', 'PATCH'].includes(r.method)) {
      entry.requestBody = {
        required: false,
        content: { 'application/json': { schema: { type: 'object' } } },
      };
    }
    paths[fullPath] = paths[fullPath] || {};
    paths[fullPath][r.method.toLowerCase()] = entry;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      contact: { name: 'headhunter-api-hub maintainers' },
    },
    servers: [
      { url: 'http://localhost:3001', description: 'local dev' },
      { url: 'https://api.example.com', description: 'production (placeholder)' },
    ],
    tags: deriveUniqueTags(routes),
    paths,
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'POST /api/v1/auth/login 拿 JWT' },
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'Authorization', description: 'ApiKey <key> — 用 scripts/create-api-key.js 签发' },
      },
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'NOT_FOUND' },
                message: { type: 'string', example: '资源不存在' },
              },
            },
          },
        },
        Success: {
          type: 'object',
          properties: { ok: { type: 'boolean', example: true }, data: {} },
        },
      },
    },
  };
}

function deriveTag(fileName) {
  // candidates.js -> Candidates, aiMatching.js -> AI Matching
  const base = fileName.replace('.js', '');
  const map = {
    candidates: 'Candidates',
    jobs: 'Jobs',
    clients: 'Clients',
    tags: 'Tags',
    recommendations: 'Recommendations',
    auth: 'Auth',
    users: 'Users',
    dashboard: 'Dashboard',
    reports: 'Reports',
    imports: 'Imports',
    interviews: 'Interviews',
    tasks: 'Tasks',
    aiMatching: 'AI Matching',
    openapi: 'Docs',
  };
  return map[base] || base.charAt(0).toUpperCase() + base.slice(1);
}

function deriveUniqueTags(routes) {
  const set = new Set();
  for (const r of routes) {
    const tag = (r.tags && r.tags[0]) || deriveTag(r.file);
    set.add(tag);
  }
  return Array.from(set).sort().map(name => ({ name }));
}

function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');
  const strictMode = args.includes('--strict');

  const routeFiles = listRouteFiles(ROUTES_DIR);
  const allRoutes = routeFiles.flatMap(extractRoutes);

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const spec = buildOpenApi(allRoutes, pkg);

  if (checkMode) {
    if (fs.existsSync(OUTPUT)) {
      const existing = fs.readFileSync(OUTPUT, 'utf8');
      const newJson = JSON.stringify(spec, null, 2);
      if (existing === newJson) {
        console.log(`✅ openapi.json 已是最新 (${allRoutes.length} routes, ${Object.keys(spec.paths).length} paths)`);
        process.exit(0);
      } else {
        console.log(`❌ openapi.json 已过时`);
        console.log('运行 `node scripts/generate-openapi.js` 重新生成');
        if (strictMode) process.exit(1);
      }
    } else {
      console.log('❌ openapi.json 不存在');
      if (strictMode) process.exit(1);
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(spec, null, 2));
  console.log(`✅ openapi.json 写入 (${allRoutes.length} routes, ${Object.keys(spec.paths).length} paths)`);
  let skeletonCount = 0;
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, entry] of Object.entries(methods)) {
      if (!entry.summary || entry.summary.startsWith('[')) skeletonCount++;
    }
  }
  if (skeletonCount > 0) {
    console.log(`ℹ️  ${skeletonCount} endpoint(s) 仍是 skeleton summary, 可在 src/routes/*.js 加 @openapi-summary <text> 注解`);
  }
}

main();
