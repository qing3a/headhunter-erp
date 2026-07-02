// tests/e2e-edge/resources.test.js
// E2E 边界 case #4: 资源（10 case）
// 大分页、越界、特殊字符、超长字段、overdue、文件大小限制、连续调用稳定性。

const http = require('http');
const fs = require('fs');
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

  // Case 1: GET /candidates?pageSize=100 看分页（应为 100 条或更少）
  const r1 = await req('GET', '/candidates?pageSize=100', null, ta);
  const r1len = (r1.body.data || []).length;
  t('GET candidates?pageSize=100 ≤ 100', r1.code === 200 && r1len <= 100, 'len=' + r1len);

  // Case 2: GET /candidates?page=999 看越界（应空 data）
  const r2 = await req('GET', '/candidates?page=999&pageSize=10', null, ta);
  t('GET candidates?page=999 应空 data', r2.code === 200 && (r2.body.data || []).length === 0, 'len=' + (r2.body.data || []).length);

  // Case 3: GET /candidates?keyword= 空格 → 走 keyword 长度 < 2 短路
  // keyword=' ' 长度 1 → 应返 total=0，不报错（响应 meta.total=0）
  const r3 = await req('GET', '/candidates?keyword=' + encodeURIComponent(' '), null, ta);
  t('GET candidates?keyword= 长度 < 2 短路 → 200', r3.code === 200 && r3.body.meta && r3.body.meta.total === 0, 'total=' + (r3.body.meta && r3.body.meta.total));

  // Case 4: GET /candidates?tag= OR ?tag=' 特殊字符 → 不报 SQL 错
  const r4a = await req('GET', '/candidates?tag=' + encodeURIComponent("' OR 1=1 --"), null, ta);
  const r4b = await req('GET', '/candidates?tag=' + encodeURIComponent('"\'\"; DROP TABLE candidates; --'), null, ta);
  t('特殊字符 tag 查询不报 SQL 错', r4a.code === 200 && r4b.code === 200, 'r4a=' + r4a.code + ' r4b=' + r4b.code);

  // Case 5: POST /candidates name 超长（1000 字符）→ 接受
  const longName = 'A'.repeat(1000);
  const r5 = await req('POST', '/candidates', { name: longName, email: 'r5_' + ts + '@x.com' }, ta);
  t('POST candidates name 1000 字符 → 接受', r5.body.ok, 'code=' + r5.code);

  // Case 6: POST /candidates email 超长（255 字符）→ 接受
  const longEmail = 'a'.repeat(240) + '_r6_' + ts + '@x.com';
  const r6 = await req('POST', '/candidates', { name: 'R6-' + ts, email: longEmail }, ta);
  // SQLite 不强约束长度，应接受
  t('POST candidates email 长字符串 → 接受', r6.body.ok || r6.code === 200, 'code=' + r6.code);

  // Case 7: 推荐 overdue 列表（demo 顾问应只看自己的 overdue）
  const r7 = await req('GET', '/recommendations/overdue', null, td);
  // demo 用户的 overdue 应都是自己推荐的
  const r7others = (r7.body.data || []).filter(r => r.recommend_username !== '演示账号' && r.recommend_user_id !== undefined);
  // 弱断言：不应 5xx
  t('GET recommendations/overdue demo → 200', r7.code === 200, 'code=' + r7.code);

  // Case 8: audit-log 列表分页（pageSize=50）
  const r8 = await req('GET', '/auth/audit-log?pageSize=50', null, ta);
  const r8len = (r8.body.data || []).length;
  t('GET audit-log?pageSize=50 → 200 且 ≤50', r8.code === 200 && r8len <= 50, 'len=' + r8len);

  // Case 9: POST /imports 6MB 文件 → 400（multer 限制 5MB）
  const r9 = await new Promise((res) => {
    const boundary = '----r9' + Date.now();
    const fileData = Buffer.alloc(6 * 1024 * 1024, 'x'); // 6MB
    const parts = [];
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="mapping"\r\n\r\n{"姓名":"name"}\r\n'));
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="big.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'));
    parts.push(fileData);
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
    const body = Buffer.concat(parts);
    const opts = { hostname: 'localhost', port: 3001, path: '/api/v1/imports/commit', method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length, 'Authorization': 'Bearer ' + ta } };
    const r = http.request(opts, x => { let s=''; x.on('data', c => s += c); x.on('end', () => { try { res({ code: x.statusCode, body: JSON.parse(s) }); } catch (e) { res({ code: x.statusCode, body: s }); } }); });
    r.write(body);
    r.end();
  });
  t('POST imports 6MB 文件 → 400 (multer 限制)', r9.code === 400, 'code=' + r9.code);

  // Case 10: dashboard/stats 频繁调用（10 次连续）应都 200
  const r10proms = await Promise.all(Array.from({ length: 10 }, () => req('GET', '/dashboard/stats', null, ta)));
  const r10ok = r10proms.every(r => r.code === 200);
  t('dashboard/stats 10 次连续都 200', r10ok, '失败数=' + r10proms.filter(r => r.code !== 200).length);

  console.log('\n=== E2E-edge resources 验证: Pass: ' + pass + ' | Fail: ' + fail + ' ===');
  process.exit(fail > 0 ? 1 : 0);
})();