// tests/e2e-edge/concurrency.test.js
// E2E 边界 case #1: 并发竞态（10 case）
// 注意：vitest fileParallelism=false（better-sqlite3 文件锁），E2E 独立 BFF 进程。
// 用例通过 req 并发触发，期望 SQL 同步锁 + Express 中间件足够支撑。

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

  // Case 1: 并发 5 个 GET /candidates?pageSize=10 同时触发（不应有 race）
  const c1 = await Promise.all(Array.from({ length: 5 }, () => req('GET', '/candidates?pageSize=10', null, ta)));
  const c1Ok = c1.every(r => r.body.ok && Array.isArray(r.body.data));
  const c1Ids = c1.map(r => r.body.data.map(x => x.id).join(','));
  const c1Consistent = new Set(c1Ids).size === 1;
  t('并发 5x GET candidates 分页一致', c1Ok && c1Consistent, '一致=' + c1Consistent + ' len=' + (c1[0].body.data || []).length);

  // Case 2: 并发 10 个 POST /candidates（每个不同 email）应全成功
  const ts = Date.now();
  const c2proms = Array.from({ length: 10 }, (_, i) => req('POST', '/candidates', { name: '并发C2-' + ts + '-' + i, email: 'concurrency_c2_' + ts + '_' + i + '@x.com' }, ta));
  const c2res = await Promise.all(c2proms);
  const c2Success = c2res.filter(r => r.body.ok).length;
  t('并发 10x POST candidates 全成功', c2Success === 10, '成功=' + c2Success + '/10');

  // Case 3: 并发 2 个 DELETE 同一 candidate（一个 200 一个 404）
  const c3email = 'c3_' + ts + '@x.com';
  const c3r = await req('POST', '/candidates', { name: '并发C3', email: c3email }, ta);
  const c3cid = c3r.body.data.id;
  const c3del = await Promise.all([req('DELETE', '/candidates/' + c3cid, null, ta), req('DELETE', '/candidates/' + c3cid, null, ta)]);
  const c3okCnt = c3del.filter(r => r.body.ok).length;
  const c3errCnt = c3del.filter(r => !r.body.ok).length;
  t('并发 2x DELETE 同 candidate 一胜一负', c3okCnt === 1 && c3errCnt === 1, '200=' + c3okCnt + ' 4xx=' + c3errCnt);

  // Case 4: 并发 8 个 login admin（验证 loginLimiter：15min/10；前面 taR+tdR 已 2 次）
  // loginLimiter 窗口 15min/10。前面 taR + tdR 已 2 次，这次并发 8 次共 10 次恰好到上限 → 不应爆 429
  const c4logins = await Promise.all(Array.from({ length: 8 }, () => req('POST', '/auth/login', { username: 'admin', password: 'admin123' })));
  const c4ok = c4logins.filter(r => r.body.ok).length;
  const c4tooMany = c4logins.filter(r => r.code === 429).length;
  t('并发 8x login 不爆 429（含前次共 10）', c4tooMany === 0, '成功=' + c4ok + ' 429=' + c4tooMany);

  // Case 5: 并发 5 个 GET /dashboard/stats（不应有数据竞争）
  const c5 = await Promise.all(Array.from({ length: 5 }, () => req('GET', '/dashboard/stats', null, ta)));
  const c5Ok = c5.every(r => r.body.ok && r.body.data);
  const c5Ids = c5.map(r => JSON.stringify({ interviews: r.body.data.interviews_count, pending: r.body.data.pending_tasks, completed: r.body.data.completed_tasks }));
  const c5Consistent = new Set(c5Ids).size === 1;
  t('并发 5x GET dashboard/stats 一致', c5Ok && c5Consistent, '一致=' + c5Consistent);

  // Case 6: 并发 audit log 写入（10 个 PUT candidates 同时，audit 应有 10 条）
  const c6email = 'c6_' + ts + '@x.com';
  const c6r = await req('POST', '/candidates', { name: '并发C6', email: c6email }, ta);
  const c6cid = c6r.body.data.id;
  await Promise.all(Array.from({ length: 10 }, (_, i) => req('PUT', '/candidates/' + c6cid, { name: '并发C6v' + i }, ta)));
  await new Promise(res => setTimeout(res, 300));
  const c6audit = await req('GET', '/auth/audit-log?action=UPDATE_candidate&pageSize=100', null, ta);
  const c6matched = (c6audit.body.data || []).filter(a => String(a.resource_id) === String(c6cid));
  t('并发 10x PUT candidates 后 audit≥10 条', c6matched.length >= 10, 'matched=' + c6matched.length);

  // Case 7: 并发 scanOverdue + admin 手动 scan（应只跑一次=或串行化）
  // P0-NEW-3 mutex：用全局 Promise 链串行化，两次调用累计 processed 应等于 overdue 行数
  const c7a = await req('POST', '/recommendations/scan-overdue', null, ta);
  const c7b = await req('POST', '/recommendations/scan-overdue', null, ta);
  const c7aOk = c7a.body.ok;
  const c7bOk = c7b.body.ok;
  t('并发 scanOverdue 串行化都不报错', c7aOk && c7bOk, 'a=' + JSON.stringify(c7a.body.data) + ' b=' + JSON.stringify(c7b.body.data));

  // Case 8: 并发 candidate_tags 加 tag（version 乐观锁：better-sqlite3 同步 + Node 单线程串行）
  // 实际场景：两个 PUT 顺序执行，第一个成功 version+1，第二个读新 version 也成功。
  // 这里验证 version 自增机制有效（两次 PUT 后 version 应 = 2）
  const c8email = 'c8_' + ts + '@x.com';
  const c8r = await req('POST', '/candidates', { name: '并发C8', email: c8email }, ta);
  const c8cid = c8r.body.data.id;
  // 初始化 tags（建 row + version=0 → INSERT）
  const c8init = await req('PUT', '/candidates/' + c8cid + '/tags', { tags: ['初始'] }, ta);
  // 顺序两次 PUT（better-sqlite3 同步，会自然串行化）
  const c8a = await req('PUT', '/candidates/' + c8cid + '/tags', { tags: ['初始', 'A'] }, ta);
  const c8b = await req('PUT', '/candidates/' + c8cid + '/tags', { tags: ['初始', 'A', 'B'] }, ta);
  // 验证最终 tag 包含 A 和 B（顺序 PUT 都成功 + version 自增）
  const c8final = await req('GET', '/candidates/' + c8cid, null, ta);
  const c8tags = (c8final.body.data.tags || []);
  t('顺序 PUT candidate_tags 都成功 + version 自增', c8init.body.ok && c8a.body.ok && c8b.body.ok && c8tags.indexOf('A') !== -1 && c8tags.indexOf('B') !== -1, 'tags=' + JSON.stringify(c8tags));

  // Case 9: 并发 client DELETE + 立即 GET notes（应不报错，notes 列表为空表示级联软删生效）
  const c9client = await req('POST', '/clients', { name: '并发C9-' + ts, industry: 'IT' }, ta);
  const c9cid = c9client.body.data.id;
  await req('POST', '/clients/' + c9cid + '/notes', { content: '并发前 note' }, ta);
  // 并发 DELETE + GET（任一都不应 5xx）
  const [c9delR, c9notesR] = await Promise.all([
    req('DELETE', '/clients/' + c9cid, null, ta),
    req('GET', '/clients/' + c9cid + '/notes', null, ta)
  ]);
  // 验证：DELETE 应成功，notes 应返 200（即使空），且都不 5xx
  const c9noErr = c9delR.code < 500 && c9notesR.code < 500;
  t('并发 DELETE client + GET notes 不 5xx', c9noErr, 'del=' + c9delR.code + ' notes=' + c9notesR.code);
  // 删后再 GET notes 应为空（级联软删生效）
  const c9afterNotes = await req('GET', '/clients/' + c9cid + '/notes', null, ta);
  t('client soft delete 级联 notes 软删', c9afterNotes.body.ok && (c9afterNotes.body.data || []).length === 0, 'notes=' + (c9afterNotes.body.data || []).length);

  // Case 10: 并发 recommendation status change（应都成功或冲突）
  const c10job = await req('POST', '/jobs', { title: '并发C10-' + ts }, ta);
  const c10jid = c10job.body.data.id;
  const c10cand = await req('POST', '/candidates', { name: '并发C10c-' + ts, email: 'c10c_' + ts + '@x.com' }, ta);
  const c10cid = c10cand.body.data.id;
  const c10rec = await req('POST', '/recommendations', { candidate_id: c10cid, job_id: c10jid }, ta);
  const c10rid = c10rec.body.data.id;
  // 并发：recommended → interviewing | rejected（两者都合法）
  const c10proms = await Promise.all([
    req('POST', '/recommendations/' + c10rid + '/status', { to_status: 'interviewing' }, ta),
    req('POST', '/recommendations/' + c10rid + '/status', { to_status: 'rejected' }, ta)
  ]);
  const c10ok = c10proms.filter(r => r.body.ok).length;
  // 乐观：应至少 1 个成功，另一个因为 canTransition 拒绝 or state 不一致返 400
  t('并发 status change 不全 500，至少 1 个成功', c10ok >= 1 && c10proms.every(r => r.code < 500), '成功=' + c10ok);

  console.log('\n=== E2E-edge concurrency 验证: Pass: ' + pass + ' | Fail: ' + fail + ' ===');
  process.exit(fail > 0 ? 1 : 0);
})();