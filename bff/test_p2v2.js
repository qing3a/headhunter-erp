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
function req(method, path, body, token, isMulti) {
  return new Promise((resolve) => {
    const opts = { hostname: 'localhost', port: 3001, path: '/api/v1' + path, method, headers: {} };
    if (isMulti) opts.headers = Object.assign({}, isMulti.headers);
    else if (body) { const data = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(data); }
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, res => { let s=''; res.on('data',c=>s+=c); res.on('end',()=>{try{resolve({code:res.statusCode, body:JSON.parse(s)})}catch(e){resolve({code:res.statusCode, body:s})}}); });
    if (!isMulti && body) r.write(JSON.stringify(body));
    if (isMulti) r.write(isMulti.body);
    r.end();
  });
}
(async () => {
  const ta = (await req('POST', '/auth/login', { username: 'admin', password: 'admin123' })).body.data.token;
  if (!ta) {
    console.log('login failed: no token');
    console.log('\n=== P2v2 验证: Pass: 0 | Fail: 1 ===');
    process.exit(1);
  }
  console.log('login ok, token=' + ta.slice(0, 20) + '...');
  // 先建一个测试候选人（避免依赖固定 cid）
  const createR = await req('POST', '/candidates', { name: 'P2v2 test ' + Date.now(), email: 'p2v2_' + Date.now() + '@x.com' }, ta);
  console.log('create response code:', createR.code, 'body.ok:', createR.body && createR.body.ok, 'cid:', createR.body && createR.body.data && createR.body.data.id);
  if (!createR.body || !createR.body.data || !createR.body.data.id) {
    console.log('create candidate failed:', createR.code, JSON.stringify(createR.body).slice(0, 200));
    console.log('\n=== P2v2 验证: Pass: 0 | Fail: 1 ===');
    process.exit(1);
  }
  const cid = createR.body.data.id;
  // PUT
  const data = JSON.stringify({ name: 'P2-C2 验证 ' + Date.now() });
  const putR = await new Promise((res) => { const opts = { hostname: 'localhost', port: 3001, path: '/api/v1/candidates/' + cid, method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Authorization': 'Bearer ' + ta } }; const r = http.request(opts, x => { let s=''; x.on('data', c => s += c); x.on('end', () => res({code: x.statusCode, body: s})); }); r.write(data); r.end(); });
  console.log('PUT response code:', putR.code, 'body:', putR.body.slice(0, 200));
  // 等 setImmediate + 100ms
  await new Promise(res => setImmediate(res));
  await new Promise(res => setTimeout(res, 200));
  // 查 audit-log
  const r2 = await req('GET', '/auth/audit-log?action=UPDATE_candidate', null, ta);
  console.log('audit-log code:', r2.code);
  console.log('audit-log raw body:', JSON.stringify(r2.body).substring(0, 200));
  console.log('audit-log data length:', r2.body && r2.body.data && r2.body.data.length);
  // 找是否有 cid 匹配的记录
  const matched = (r2.body.data || []).filter(function (x) { return String(x.resource_id) === String(cid); });
  console.log('matched for cid=' + cid + ':', matched.length);
  // 汇总
  const pass = r2.code === 200 && matched.length > 0 ? 1 : 0;
  const fail = pass ? 0 : 1;
  console.log('\n=== P2v2 验证: Pass: ' + pass + ' | Fail: ' + fail + ' ===');
  process.exit(fail > 0 ? 1 : 0);
})();
