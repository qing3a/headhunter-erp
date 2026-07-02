// tests/e2e-runner.js
// 统一 E2E 入口：每个脚本前都重启 BFF，避免 rate limit / 状态污染
// 修复：drain BFF stdout/stderr 避免 pipe 阻塞；脚本间 sleep 1.5s 避免 tokens_invalidated_after 同秒竞态
//
// 用法：cd bff && npm run e2e
// 退出码：0 = 全部 PASS；1 = 有 FAIL

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BFF = path.join(ROOT, 'bff');
const DB = path.join(BFF, 'data', 'erp.db');
const SCRIPTS = [
  path.join(ROOT, 'tests', 'e2e-p0.js'),
  path.join(BFF, 'test_p2v.js'),
  path.join(BFF, 'test_p2v2.js'),
];

function killPort(port) {
  try {
    const out = execSync(
      `netstat -ano | findstr ":${port}" | findstr "LISTENING"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    const pids = [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
    for (const pid of pids) {
      try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' }); } catch (e) {}
    }
  } catch (e) {
    // port 未占用
  }
}

function startBff() {
  console.log('\n🚀 启动 BFF（等 5s）...');
  killPort(3001);
  if (fs.existsSync(DB)) fs.unlinkSync(DB);

  const bff = spawn('node', ['src/index.js'], {
    cwd: BFF,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DEMO_SEED: 'true', CI: 'true' },
  });
  // drain stdout/stderr 避免 pipe 阻塞（morgan 会写很多日志）
  bff.stdout.on('data', () => {});
  bff.stderr.on('data', (d) => process.stderr.write('[BFF] ' + d.toString()));
  bff.on('error', (e) => console.error('BFF spawn error:', e.message));
  return bff;
}

function waitForBff(timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const http = require('http');
    function tryConnect() {
      const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/v1/health', method: 'GET' }, (res) => {
        resolve();
        res.resume();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('BFF startup timeout'));
        } else {
          setTimeout(tryConnect, 300);
        }
      });
      req.end();
    }
    tryConnect();
  });
}

function runScript(scriptPath) {
  console.log(`\n=== 跑 ${path.basename(scriptPath)} ===`);
  function parseOutput(stdout) {
    // 匹配多种格式：
    //   "=== P2 验证: Pass: 20 | Fail: 0 ==="
    //   "=== P2v2 验证: Pass: 1 | Fail: 0 ==="
    //   "结果: 20/20 通过"
    //   "🎉 所有测试通过！"（e2e-p0 全部通过）
    let m = stdout.match(/Pass:\s*(\d+)\s*\|\s*Fail:\s*(\d+)/);
    if (m) return { pass: parseInt(m[1]), fail: parseInt(m[2]) };
    m = stdout.match(/结果:\s*(\d+)\/(\d+)\s+通过/);
    if (m) return { pass: parseInt(m[1]), fail: 0 };
    if (stdout.includes('所有测试通过') || stdout.includes('🎉')) return { pass: 1, fail: 0 };
    return { pass: 0, fail: 1 };
  }
  try {
    const out = execSync(`node "${scriptPath}"`, { encoding: 'utf8', stdio: 'pipe', timeout: 120000 });
    const lines = out.split('\n');
    console.log(lines.slice(Math.max(0, lines.length - 12)).join('\n'));
    return parseOutput(out);
  } catch (e) {
    const stdout = e.stdout ? e.stdout.toString() : '';
    console.error(stdout || e.message);
    return parseOutput(stdout);
  }
}

async function runScriptWithFreshBff(scriptPath) {
  const bff = startBff();
  try {
    await waitForBff(15000);
  } catch (e) {
    console.error('BFF startup failed:', e.message);
    bff.kill();
    return { pass: 0, fail: 1 };
  }
  const r = runScript(scriptPath);
  bff.kill();
  await new Promise(res => setTimeout(res, 800));
  return r;
}

(async function main() {
  let totalPass = 0, totalFail = 0;
  for (let i = 0; i < SCRIPTS.length; i++) {
    const script = SCRIPTS[i];
    if (!fs.existsSync(script)) {
      console.warn(`⚠️ 跳过 ${path.basename(script)}（不存在）`);
      continue;
    }
    const r = await runScriptWithFreshBff(script);
    totalPass += r.pass;
    totalFail += r.fail;
    // 脚本间 sleep 1.5s 避免跨脚本 tokens_invalidated_after 同秒竞态（如果脚本内做 change-password）
    if (i < SCRIPTS.length - 1) {
      await new Promise(res => setTimeout(res, 1500));
    }
  }

  console.log(`\n=== E2E 总计: Pass ${totalPass} | Fail ${totalFail} ===`);
  killPort(3001);
  process.exit(totalFail > 0 ? 1 : 0);
})();
