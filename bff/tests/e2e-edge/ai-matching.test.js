// tests/e2e-edge/ai-matching.test.js
// v8 Phase B: AI matching 端到端边界测试 (5 case)

const http = require('http');
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: 'localhost', port: 3001, path: '/api/v1' + path, method, headers: {} };
    if (body) { const data = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(data); }
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, res => { let s=''; res.on('data',c=>s+=c); res.on('end',()=>{try{resolve({code:res.statusCode, body:JSON.parse(s)})}catch(e){resolve({code:res.statusCode, body:s})}}); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
let pass = 0, fail = 0;
function t(name, cond, info) { if (cond) { pass++; console.log('OK | ' + name + (info ? ' | ' + info : '')); } else { fail++; console.log('FAIL| ' + name + (info ? ' | ' + info : '')); } }

(async () => {
  const taR = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  const ta = taR.body.data.token;

  // 准备数据：1 candidate + 2 jobs
  const cR = await req('POST', '/candidates', { name: 'AI Test', expected_industry: '互联网', expected_position: 'PM', expected_city: '北京', years_of_experience: 5, education_level: 'bachelor', email: 'ai_' + Date.now() + '@x.com' }, ta);
  const cid = cR.body.data.id;
  const j1R = await req('POST', '/jobs', { title: 'AI 匹配职位 A', industry: '互联网', city: '北京', salary_min: 30, salary_max: 50, education_level: 'bachelor' }, ta);
  const j1 = j1R.body.data.id;
  const j2R = await req('POST', '/jobs', { title: 'AI 匹配职位 B', industry: '金融', city: '上海' }, ta);
  const j2 = j2R.body.data.id;

  t('POST /ai-matching/candidate/:id/match → 200 + matches', (async () => {
    const r = await req('POST', '/ai-matching/candidate/' + cid + '/match', { job_ids: [j1, j2] }, ta);
    return r.code === 200 && r.body.ok && Array.isArray(r.body.data.matches) && r.body.data.matches.length === 2;
  })());

  t('POST /ai-matching/candidate/:id/match 排序：A 排第一', (async () => {
    const r = await req('POST', '/ai-matching/candidate/' + cid + '/match', { job_ids: [j1, j2] }, ta);
    return r.body.data.matches[0].job.id === j1;
  })());

  t('权重参数生效', (async () => {
    const r1 = await req('POST', '/ai-matching/candidate/' + cid + '/match', { job_ids: [j1], weights: { industry: 100, position: 0, city: 0, salary: 0, experience: 0, education: 0 } }, ta);
    return r1.body.data.matches[0].score === 100;
  })());

  t('不存在的 candidate → 404', (async () => {
    const r = await req('POST', '/ai-matching/candidate/99999/match', {}, ta);
    return r.code === 404;
  })());

  t('POST /ai-matching/job/:id/match → 200 + matches', (async () => {
    const r = await req('POST', '/ai-matching/job/' + j1 + '/match', {}, ta);
    return r.code === 200 && r.body.ok && Array.isArray(r.body.data.matches);
  })());

  console.log('\n=== E2E-edge 验证: Pass: ' + pass + ' | Fail: ' + fail + ' ===');
  process.exit(fail > 0 ? 1 : 0);
})();