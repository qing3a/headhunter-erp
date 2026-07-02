// bff/frontend-build.js
// 从 pages/*.html 抽取 inline <script> 块 → pages/X.js
// HTML 改成 <script type="module" src="./X.js"></script>
// esbuild bundle + minify → public/pages/
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES_DIR = path.join(ROOT, 'pages');
const SHARED_DIR = path.join(ROOT, 'shared');
const PARTIALS_DIR = path.join(ROOT, 'partials');
const OUT_DIR = path.join(__dirname, 'public');

function findPages() {
  return fs.readdirSync(PAGES_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(PAGES_DIR, f));
}

// 优先取 <script id="pageScript">CODE</script>
// 否则取 layout.js 之后的所有 <script>CODE</script>（拼成一段）
function extractScript(html) {
  const m = html.match(/<script id="pageScript">([\s\S]*?)<\/script>/);
  if (m) return m[1];

  // Fallback: 取 layout.js 之后所有非 src 的 <script> 块
  const layoutIdx = html.search(/<script src="\.\.\/shared\/layout\.js"><\/script>/);
  if (layoutIdx < 0) return null;
  const tail = html.slice(layoutIdx);
  const blocks = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let mm;
  while ((mm = re.exec(tail)) !== null) {
    if (mm[1].trim()) blocks.push(mm[1]);
  }
  return blocks.length ? blocks.join('\n;\n') : null;
}

function replaceScript(html, jsFilename) {
  // 把 <script id="pageScript">...</script> 替换成 <script type="module" src="./X.js"></script>
  if (/<script id="pageScript">/.test(html)) {
    return html.replace(
      /<script id="pageScript">[\s\S]*?<\/script>/,
      `<script type="module" src="./${jsFilename}"></script>`
    );
  }
  // Fallback: 把 layout.js 之后所有 <script>CODE</script> 替换成单个 module 引用
  const layoutIdx = html.search(/<script src="\.\.\/shared\/layout\.js"><\/script>/);
  if (layoutIdx < 0) return html;
  const head = html.slice(0, layoutIdx);
  const tail = html.slice(layoutIdx);
  const cleaned = tail.replace(/<script>[\s\S]*?<\/script>/g, '');
  return head + cleaned + `\n  <script type="module" src="./${jsFilename}"></script>\n`;
}

async function build() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPages = path.join(OUT_DIR, 'pages');
  if (!fs.existsSync(outPages)) fs.mkdirSync(outPages, { recursive: true });

  const pages = findPages();
  console.log(`Build ${pages.length} pages...`);

  const stats = { extracted: 0, copied: 0, errors: [] };

  for (const pagePath of pages) {
    const pageName = path.basename(pagePath, '.html');
    const html = fs.readFileSync(pagePath, 'utf8');
    const script = extractScript(html);

    if (!script || !script.trim()) {
      // 没 pageScript / 没 inline 逻辑（login / register / forgot-password / interview-detail）
      // 直接 copy HTML
      fs.writeFileSync(path.join(outPages, path.basename(pagePath)), html);
      stats.copied++;
      continue;
    }

    try {
      // 写抽取出的 JS 到 public/pages/<name>.js
      const outJs = path.join(outPages, `${pageName}.js`);
      fs.writeFileSync(outJs, script);

      // esbuild bundle + minify (in-place)
      // 关闭 treeShaking：page script 里有 onclick="openContactModal()" 等
      // 从 HTML 调用的全局函数，esbuild 看不到引用，会被当作 dead code 删掉
      await esbuild.build({
        entryPoints: [outJs],
        bundle: true,
        minify: true,
        format: 'iife',
        target: 'es2018',
        outfile: outJs,
        allowOverwrite: true,
        treeShaking: false,
        logLevel: 'silent',
      });

      // 改 HTML 引用
      const newHtml = replaceScript(html, `${pageName}.js`);
      fs.writeFileSync(path.join(outPages, path.basename(pagePath)), newHtml);
      stats.extracted++;
    } catch (e) {
      stats.errors.push({ page: pageName, err: e.message });
    }
  }

  // 复制 shared/* → public/shared/
  const outShared = path.join(OUT_DIR, 'shared');
  if (!fs.existsSync(outShared)) fs.mkdirSync(outShared, { recursive: true });
  for (const f of fs.readdirSync(SHARED_DIR)) {
    if (f.endsWith('.js') || f.endsWith('.css')) {
      fs.copyFileSync(path.join(SHARED_DIR, f), path.join(outShared, f));
    }
  }

  // 复制 partials/* → public/partials/
  const outPartials = path.join(OUT_DIR, 'partials');
  if (fs.existsSync(PARTIALS_DIR)) {
    if (!fs.existsSync(outPartials)) fs.mkdirSync(outPartials, { recursive: true });
    for (const f of fs.readdirSync(PARTIALS_DIR)) {
      fs.copyFileSync(path.join(PARTIALS_DIR, f), path.join(outPartials, f));
    }
  }

  console.log(`✅ extracted=${stats.extracted}  copied=${stats.copied}  errors=${stats.errors.length}`);
  if (stats.errors.length) console.log('Errors:', stats.errors);
  console.log('Build complete → public/');
}

build().catch(e => { console.error(e); process.exit(1); });
