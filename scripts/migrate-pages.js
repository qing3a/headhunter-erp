const fs = require('fs');
const path = require('path');

const PAGES = [
  'dashboard.html',
  'candidate-pool.html',
  'candidate-detail.html',
  'candidate-import.html',
  'job-management.html',
  'job-create.html',
  'job-detail.html',
  'interview-management.html',
  'interview-detail.html',
  'client-management.html',
  'client-detail.html',
  'ai-matching.html',
  'notifications.html',
  'reports.html',
  'settings.html',
];

const PAGES_DIR = path.join(__dirname, '..', 'pages');

function dedupScriptTags(src) {
  const tagPattern = /<script src="\.\.\/shared\/(auth|loading|router|api|shared|storage|layout)\.js"><\/script>\n?/g;
  const seen = new Set();
  const lines = src.split('\n');
  const out = [];
  for (const line of lines) {
    const m = line.match(/<script src="\.\.\/shared\/(auth|loading|router|api|shared|storage|layout)\.js"><\/script>/);
    if (m) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
    }
    out.push(line);
  }
  return out.join('\n');
}

function migrateFile(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  const before = src;
  let changed = false;

  const hadDup = (src.match(/<script src="\.\.\/shared\/auth\.js"><\/script>/g) || []).length > 1;
  const deduped = dedupScriptTags(src);
  if (deduped !== src) {
    src = deduped;
    changed = true;
  }

  const hasAuth = /<script src="\.\.\/shared\/auth\.js"><\/script>/.test(src);
  const hasApi = /<script src="\.\.\/shared\/api\.js"><\/script>/.test(src);

  if (hasApi && !hasAuth) {
    src = src.replace(
      /<script src="\.\.\/shared\/api\.js"><\/script>/,
      `<script src="../shared/auth.js"></script>
  <script src="../shared/loading.js"></script>
  <script src="../shared/router.js"></script>
  <script src="../shared/api.js"></script>`
    );
    changed = true;
  } else if (!hasApi) {
    src = src.replace(
      /<script src="\.\.\/shared\/shared\.js"><\/script>/,
      `<script src="../shared/auth.js"></script>
  <script src="../shared/loading.js"></script>
  <script src="../shared/router.js"></script>
  <script src="../shared/api.js"></script>
  <script src="../shared/shared.js"></script>`
    );
    changed = true;
  }

  if (!/Auth\.isLoggedIn\(\)|window\.Auth|Auth\.requireLogin/.test(src) && !/shared\/layout\.js/.test(src)) {
    if (/<\/body>/i.test(src)) {
      src = src.replace(
        /<\/body>/i,
        `  <script>
    if (!window.Auth || !Auth.isLoggedIn()) {
      if (window.Auth) Auth.requireLogin();
      else location.replace('../pages/login.html');
    }
  </script>
</body>`
      );
      changed = true;
    }
  }

  if (!changed) {
    console.log('NO-CHANGE', path.basename(filePath));
    return false;
  }
  fs.writeFileSync(filePath, src, 'utf8');
  console.log('OK', path.basename(filePath));
  return true;
}

let count = 0;
PAGES.forEach(name => {
  const fp = path.join(PAGES_DIR, name);
  if (!fs.existsSync(fp)) {
    console.log('MISSING', name);
    return;
  }
  if (migrateFile(fp)) count++;
});
console.log(`Migrated ${count}/${PAGES.length}`);
