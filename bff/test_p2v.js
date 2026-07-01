const http = require('http');
const fs = require('fs');
function buildMultipart(fields, fileField, filePath) {
  const boundary = '----P2' + Date.now();
  const fileData = fs.readFileSync(filePath);
  const fileName = filePath.split(/[\\/]/).pop();
  const parts = [];
  for (var k in fields) parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + fields[k] + '\r\n'));
  parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + fileField + '"; filename="' + fileName + '"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'));
  parts.push(fileData);
  parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
  return { body: Buffer.concat(parts), contentType: 'multipart/form-data; boundary=' + boundary };
}
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: 'localhost', port: 3001, path: '/api/v1' + path, method, headers: {} };
    if (body) { const data = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(data); }
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, res => { let s=''; res.on('data',c=>s+=c); res.on('end',()=>{try{resolve({code:res.statusCode, body:JSON.parse(s)})}catch(e){resolve({code:res.statusCode, body:s})}}); });
    if (body) r.write(JSON.stringify(body));
    if (method !== 'GET' && method !== 'HEAD' && body) {}  // noop
    r.end();
  });
}
let pass=0, fail=0;
function t(name, cond, info) { if (cond) { pass++; console.log('OK  | ' + name + (info ? ' | ' + info : '')); } else { fail++; console.log('FAIL| ' + name + (info ? ' | ' + info : '')); } }

(async () => {
  const taR = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  const ta = taR.body.data.token;
  const tdR = await req('POST', '/auth/login', { username: 'demo', password: 'demo123' });
  const td = tdR.body.data.token;
  console.log('Tokens OK');

  const uEmail = 'p2f_' + Date.now() + '@x.com';
  let r = await req('POST', '/candidates', { name: 'P2最终', email: uEmail }, ta);
  t('基础: candidates create', r.body.ok, 'cid=' + r.body.data.id);
  const cid = r.body.data.id;

  // P2-B4 via HTTP
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('test');
  ws.columns = [{ header: '姓名', key: 'name', width: 12 }, { header: '邮箱', key: 'email', width: 20 }];
  ws.addRow({ name: '格式错', email: 'not-an-email' });
  ws.addRow({ name: '格式对', email: 'good_' + Date.now() + '@x.com' });
  const buf = await wb.xlsx.writeBuffer();
  fs.writeFileSync('/tmp/p2test.xlsx', Buffer.from(buf));
  const m = buildMultipart({ mapping: JSON.stringify({ '姓名': 'name', '邮箱': 'email' }), skipDuplicates: 'true' }, 'file', '/tmp/p2test.xlsx');
  r = await new Promise((res) => { const opts = { hostname: 'localhost', port: 3001, path: '/api/v1/imports/commit', method: 'POST', headers: { 'Content-Type': m.contentType, 'Content-Length': m.body.length, 'Authorization': 'Bearer ' + ta } }; const rq = http.request(opts, x => { let s=''; x.on('data',c=>s+=c); x.on('end',()=>{try{res({code:x.statusCode, body:JSON.parse(s)})}catch(e){res({code:x.statusCode, body:s})}}); }); rq.write(m.body); rq.end(); });
  t('P2-B4a: 邮箱格式错失败', r.body.data.failed === 1 && r.body.data.errors[0].error.indexOf('邮箱格式') !== -1);
  t('P2-B4b: 邮箱格式对成功', r.body.data.success === 1);

  // P2-C1
  r = await req('POST', '/jobs', { title: 'P2-C1 职位' }, ta);
  const c1JobId = r.body.data.id;
  await req('PUT', '/jobs/' + c1JobId, { status: 'closed' }, ta);
  r = await req('POST', '/recommendations', { candidate_id: 1, job_id: c1JobId }, ta);
  t('P2-C1: closed 职位推荐被拒', !r.body.ok && r.body.error.message.indexOf('关闭') !== -1);
  await req('PUT', '/jobs/' + c1JobId, { status: 'open' }, ta);
  r = await req('POST', '/recommendations', { candidate_id: 2, job_id: c1JobId }, ta);
  t('P2-C1: open 职位推荐 OK', r.body.ok);

  // P2-C2: PUT + 等 setImmediate + GET audit-log
  r = await req('PUT', '/candidates/' + cid, { name: '改名验证' + Date.now() }, ta);
  t('P2-C2: PUT 200', r.body.ok);
  await new Promise(res => setImmediate(res));
  await new Promise(res => setTimeout(res, 100));
  // GET 不传 body
  r = await new Promise((res) => { const opts = { hostname: 'localhost', port: 3001, path: '/api/v1/auth/audit-log?action=UPDATE_candidate', method: 'GET', headers: { 'Authorization': 'Bearer ' + ta } }; const rq = http.request(opts, x => { let s=''; x.on('data',c=>s+=c); x.on('end',()=>{try{res({code:x.statusCode, body:JSON.parse(s)})}catch(e){res({code:x.statusCode, body:s})}}); }); rq.end(); });
  const matched = r.body && r.body.data && r.body.data.filter(function (x) { return String(x.resource_id) === String(cid); }) || [];
  t('P2-C2: audit-log 含 UPDATE_candidate for cid=' + cid, matched.length > 0, 'matched=' + matched.length);

  // P2-C3
  r = await req('POST', '/recommendations', { candidate_id: cid, job_id: c1JobId }, ta);
  const recId = r.body.data.id;
  await req('DELETE', '/recommendations/' + recId, null, ta);
  r = await req('GET', '/candidates/' + cid, null, ta);
  const recIds = (r.body.data.recommendations || []).map(function (x) { return x.id; });
  t('P2-C3: 软删 rec 不返回', recIds.indexOf(recId) === -1, 'recs=' + recIds.length);

  // P2-C4
  const uEmail2 = 'p2c4_' + Date.now() + '@x.com';
  r = await req('POST', '/candidates', { name: 'P2-C4', email: uEmail2 }, ta);
  const c4Id = r.body.data.id;
  await req('PUT', '/candidates/' + c4Id + '/tags', { tags: ['测试标签'] }, ta);
  r = await req('PUT', '/tags/' + encodeURIComponent('测试标签') + '/rename', { new_name: '测试标签v2' }, ta);
  t('P2-C4: tag rename OK', r.body.ok, 'updated=' + r.body.data.updated);
  r = await req('GET', '/candidates?tag=' + encodeURIComponent('测试标签v2'), null, ta);
  t('P2-C4: rename 后能找到新 tag', r.body.data && r.body.data.length >= 1);

  // 跨用户
  r = await req('PUT', '/candidates/' + cid, { name: 'hack' }, td);
  t('跨用户: demo 不能改 admin', !r.body.ok);

  // 前端 / 配置 grep
  const apiJs = fs.readFileSync('../shared/api.js', 'utf8');
  t('P2-A1: _request 含 PAYLOAD_TOO_LARGE', apiJs.indexOf('PAYLOAD_TOO_LARGE') > 0);
  t('P2-A1: _request 含 RATE_LIMITED', apiJs.indexOf('RATE_LIMITED') > 0);
  const eh = fs.readFileSync('src/middleware/errorHandler.js', 'utf8');
  t('P2-A2: errorHandler 含 isDev / production', eh.indexOf('isDev') > 0 && eh.indexOf('production') > 0);
  const settingsHtml = fs.readFileSync('../pages/settings.html', 'utf8');
  t('P2-B2/D1: settings.html 含 data-key', settingsHtml.indexOf('data-key=') > 0);
  const authJs = fs.readFileSync('src/routes/auth.js', 'utf8');
  t('P2-B3: getIp 不再用 x-forwarded-for', !/x-forwarded-for/.test(authJs));
  const detailHtml = fs.readFileSync('../pages/candidate-detail.html', 'utf8');
  t('P2-C3: detail.html 含 c.recommendations 遍历', detailHtml.indexOf('c.recommendations') > 0);
  const tagsJs = fs.readFileSync('src/routes/tags.js', 'utf8');
  t('P2-C4: tags.js 含 withTagsLock', tagsJs.indexOf('withTagsLock') > 0);
  const poolHtml = fs.readFileSync('../pages/candidate-pool.html', 'utf8');
  t('P2-D2: pool.html applyView 含 validOptions', poolHtml.indexOf('validOptions') > 0);
  t('P2-D3: pool.html 含 selectAllPages', poolHtml.indexOf('selectAllPages') > 0);

  console.log('\n=== P2 验证: Pass: ' + pass + ' | Fail: ' + fail + ' ===');
})();
