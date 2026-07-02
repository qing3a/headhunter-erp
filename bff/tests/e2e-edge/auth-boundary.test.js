// tests/e2e-edge/auth-boundary.test.js
// E2E 边界 case #3: auth 边界（10 case）
// 跨用户访问、admin-only、未登录、错误 token、旧密码错误 等场景。

const http = require('http');
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: 'localhost', port: 3001, path: '/api/v1' + path, method, headers: {} };
    if (body) { const data = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(data); }
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, res => { let s=''; res.on('data', c => s += c); res.on('end', () => { try { resolve({ code: res.statusCode, body: JSON.parse(s) }); } catch (e) { resolve({ code: res.statusCode, body: s }); } }); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
let pass = 0, fail = 0;
function t(name, cond, info) { if (cond) { pass++; console.log('OK  | ' + name + (info ? ' | ' + info : '')); } else { fail++; console.log('FAIL| ' + name + (info ? ' | ' + info : '')); } }

(async () => {
  const taR = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  const ta = taR.body.data.token;
  const tdR = await req('POST', '/auth/login', { username: 'demo', password: 'demo123' });
  const td = tdR.body.data.token;
  const ts = Date.now();

  // Case 1: 跨用户 PUT（admin token 改 demo 的 candidate，admin 应能改）
  const a1email = 'auth_a1_' + ts + '@x.com';
  const a1r = await req('POST', '/candidates', { name: 'authC1-' + ts, email: a1email }, td);
  const a1cid = a1r.body.data.id;
  const a1 = await req('PUT', '/candidates/' + a1cid, { name: 'admin改名' }, ta);
  t('admin 改 demo 的 candidate → 200', a1.body.ok, 'code=' + a1.code);

  // Case 2: 跨用户 PUT（demo token 改 admin 的 candidate → 404）
  const a2email = 'auth_a2_' + ts + '@x.com';
  const a2r = await req('POST', '/candidates', { name: 'authC2-' + ts, email: a2email }, ta);
  const a2cid = a2r.body.data.id;
  const a2 = await req('PUT', '/candidates/' + a2cid, { name: 'demo hack' }, td);
  t('demo 改 admin 的 candidate → 404 NOT_FOUND', a2.code === 404 && a2.body.error && a2.body.error.code === 'NOT_FOUND', 'code=' + a2.code);

  // Case 3: 跨用户 DELETE（demo 删 admin 的 candidate → 404）
  const a3 = await req('DELETE', '/candidates/' + a2cid, null, td);
  t('demo 删 admin 的 candidate → 404', a3.code === 404, 'code=' + a3.code);
  // 验证确实没删
  const a3verify = await req('GET', '/candidates/' + a2cid, null, ta);
  t('admin 仍能 GET 自己的 candidate → 200', a3verify.body.ok, 'ok=' + a3verify.body.ok);

  // Case 4: 非 admin 调 admin-only（如 POST /tags/merge）→ 403
  // v7.5 Bug 3 修复：tags.js /merge 挂 requireRole('admin') → 403 FORBIDDEN
  const a4 = await req('POST', '/tags/merge', { from: ['x'], to: 'y' }, td);
  t('demo 调 admin-only tags/merge → 403 FORBIDDEN', a4.code === 403 && a4.body.error && a4.body.error.code === 'FORBIDDEN', 'code=' + a4.code + ' (v7.5 修复后: 403)');

  // Case 5: 普通用户 list 看不到其他用户数据
  // admin 建一个 candidate，demo 应看不到
  const a5email = 'auth_a5_' + ts + '@x.com';
  await req('POST', '/candidates', { name: '仅admin-' + ts, email: a5email }, ta);
  const a5 = await req('GET', '/candidates?keyword=' + encodeURIComponent('仅admin-' + ts), null, td);
  const a5hasOthers = (a5.body.data || []).filter(c => c.name === '仅admin-' + ts).length;
  t('demo 看不到 admin 独有 candidate', a5hasOthers === 0, '看到=' + a5hasOthers);

  // Case 6: 普通用户 /tags 看不到其他用户的 tag
  const a6email = 'auth_a6_' + ts + '@x.com';
  const a6r = await req('POST', '/candidates', { name: 'authC6-' + ts, email: a6email }, ta);
  await req('PUT', '/candidates/' + a6r.body.data.id + '/tags', { tags: ['admin私有tag' + ts] }, ta);
  const a6 = await req('GET', '/tags', null, td);
  const a6hasOthers = (a6.body.data || []).filter(tg => tg.name === 'admin私有tag' + ts).length;
  t('demo GET /tags 看不到 admin tag', a6hasOthers === 0, '看到=' + a6hasOthers);

  // Case 7: admin /tags/lookup 看所有 / 普通用户只看自己的
  // 注：当前 candidates/:id/tags 的 PUT 会被 loadAllTags 用 user_id 过滤（admin 看全，普通用户看自己）
  const a7 = await req('GET', '/tags', null, ta);
  const a7hasAdminTag = (a7.body.data || []).filter(tg => tg.name === 'admin私有tag' + ts).length;
  t('admin GET /tags 看 admin tag', a7hasAdminTag >= 1, '看到=' + a7hasAdminTag);

  // Case 8: GET /auth/me 无 token → 401
  const a8 = await req('GET', '/auth/me', null, null);
  t('GET auth/me 无 token → 401', a8.code === 401, 'code=' + a8.code);

  // Case 9: GET /auth/me 错误 token → 401
  const a9 = await req('GET', '/auth/me', null, 'invalid_token_xxx');
  t('GET auth/me 错误 token → 401', a9.code === 401, 'code=' + a9.code);

  // Case 10: POST /auth/change-password 旧密码错误 → 400
  const a10 = await req('POST', '/auth/change-password', { old_password: 'wrong_password', new_password: 'newpwd123' }, td);
  t('change-password 旧密码错 → 400', a10.code === 400, 'code=' + a10.code);
  // 注意：case 10 不要真改 demo 的密码，避免影响后续测试

  console.log('\n=== E2E-edge auth-boundary 验证: Pass: ' + pass + ' | Fail: ' + fail + ' ===');
  process.exit(fail > 0 ? 1 : 0);
})();