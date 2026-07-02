// bff/smoke-test.js
// 静态资源 + 语法验证（happy-dom 在 CLI 环境无法跑真 browser）
const http = require('http');
const vm = require('vm');

const BASE = 'http://localhost:3001';
const PAGES_TO_TEST = [
  'candidate-pool.html',
  'dashboard.html',
  'candidate-detail.html',
  // 多测几个非关键 page 看 build 完整性
  'client-management.html',
  'job-management.html',
  'settings.html',
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function syntaxCheck(code, filename) {
  try { new vm.Script(code, { filename }); return null; }
  catch (e) { return e.message; }
}

async function testPage(pageName) {
  const htmlRes = await fetchUrl(`${BASE}/pages/${pageName}`);
  if (htmlRes.status !== 200) return { ok: false, err: `HTML ${htmlRes.status}` };
  const htmlBytes = htmlRes.body.length;

  const hasModule = /<script type="module" src="\.\/([\w-]+)\.js"><\/script>/.test(htmlRes.body);
  if (!hasModule) {
    const hasPageScript = /<script id="pageScript">/.test(htmlRes.body);
    if (hasPageScript) return { ok: false, err: 'still has pageScript' };
    return { ok: true, info: `no inline code, html=${htmlBytes}b` };
  }
  const m = htmlRes.body.match(/<script type="module" src="\.\/([\w-]+)\.js"><\/script>/);
  const jsName = m[1];

  const jsRes = await fetchUrl(`${BASE}/pages/${jsName}.js`);
  if (jsRes.status !== 200) return { ok: false, err: `JS ${jsRes.status}` };
  const jsBytes = jsRes.body.length;

  const err = syntaxCheck(jsRes.body, jsName + '.js');
  if (err) return { ok: false, err: `JS syntax: ${err.slice(0, 100)}` };

  return { ok: true, info: `html=${htmlBytes}b js=${jsBytes}b`, jsName };
}

(async () => {
  let allOk = true;
  for (const p of PAGES_TO_TEST) {
    const r = await testPage(p);
    if (r.ok) {
      console.log(`  ✓ ${p.padEnd(30)} ${r.info || ''}`);
    } else {
      console.log(`  ✗ ${p.padEnd(30)} ${r.err}`);
      allOk = false;
    }
  }
  console.log(`\n=== Result: ${allOk ? 'ALL PASS' : 'FAIL'} ===`);
  console.log(`注：CLI 环境无真 browser，仅验证 HTTP 200 + JS 语法。完整手测需浏览器。`);
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
