import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const staticDir = process.env.STATIC_OUT ? path.resolve(process.env.STATIC_OUT) : null;

const headScripts = `
  <script src="/academic/assets/mingyue-auth-sync.js?v=20260910"></script>
  <script src="/academic/assets/mingyue-site-config.js?v=20260910"></script>`;

const extraCss = `
  <link rel="stylesheet" href="/academic/assets/mingyue-responsive-v20260724c.css">
  <link rel="stylesheet" href="/academic/assets/mingyue-design-purple.css">
  <link rel="stylesheet" href="/academic/assets/vendor/katex/katex.min.css">
  <link rel="stylesheet" href="/academic/assets/mingyue-doc.css?v=20260915">
  <link rel="stylesheet" href="/academic/assets/mingyue-doc-create.css?v=20260910">
  <link rel="stylesheet" href="/academic/assets/mingyue-refine.css?v=20260910e">
  <link rel="stylesheet" href="/academic/assets/mingyue-admin.css?v=20260910">
  <link rel="stylesheet" href="/academic/assets/mingyue-unify.css?v=20260911b">
  <script defer src="/academic/assets/mingyue-literary.js?v=20260910"></script>`;

const dataEntry = `
  <style>
    #mq-data-entry{position:fixed;right:22px;bottom:22px;z-index:30;display:none;align-items:center;gap:7px;
      background:#682080;color:#fff;font-size:13px;padding:11px 18px;border-radius:999px;
      text-decoration:none;box-shadow:0 10px 26px rgba(74,16,99,.32);letter-spacing:.04em;
      font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif;transition:.2s}
    #mq-data-entry:hover{background:#4a1063;transform:translateY(-2px)}
    #mq-data-entry::before{content:"◈";font-size:14px;opacity:.9}
    @media(max-width:860px){#mq-data-entry{right:14px;bottom:14px;padding:9px 15px;font-size:12px}}
  </style>
  <a id="mq-data-entry" href="/academic/data.html">数据管理</a>
  <script>
    (function () {
      try {
        var u = {};
        try { u = JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch (e) {}
        var role = u.role || '';
        if (role && role !== 'student') document.getElementById('mq-data-entry').style.display = 'inline-flex';
      } catch (e) {}
    })();
  </script>`;

const bodyScripts = `
  <script defer src="/academic/assets/vendor/purify.min.js"></script>
  <script defer src="/academic/assets/vendor/marked.min.js"></script>
  <script defer src="/academic/assets/vendor/katex.min.js"></script>
  <script defer src="/academic/assets/vendor/auto-render.min.js"></script>
  <script defer src="/academic/assets/mingyue-doc-viewer.js?v=20260915"></script>
  <script defer src="/academic/assets/mingyue-post-panel.js?v=20260915"></script>
  <script defer src="/academic/assets/mingyue-doc-create.js?v=20260910"></script>
  <script defer src="/academic/assets/mingyue-refine.js?v=20260915"></script>
  ${dataEntry}`;

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!html.includes('mingyue-auth-sync.js')) {
  html = html.replace(/<head([^>]*)>/i, `<head$1>${headScripts}`);
  html = html.replace(/<\/head>/i, `${extraCss}\n</head>`);
  html = html.replace(/<\/body>/i, `${bodyScripts}\n</body>`);
}
fs.writeFileSync(path.join(dist, 'index.html'), html);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 默认只产出 dist/，不覆盖生产快照 static/。
// 需要发布时显式设置 STATIC_OUT，例如：
//   STATIC_OUT=../static npm run build
if (!staticDir) {
  console.log('postbuild: STATIC_OUT 未设置，仅生成 dist/，未改动 static/ 生产快照');
  process.exit(0);
}

// 只清理上一版 Vite 生成物，保留手写页面/JS/CSS/vendor
fs.mkdirSync(path.join(staticDir, 'assets'), { recursive: true });
for (const name of fs.readdirSync(path.join(staticDir, 'assets'))) {
  if (/^index-.*\.(js|css|map)$/i.test(name)) {
    fs.rmSync(path.join(staticDir, 'assets', name), { force: true });
  }
}
copyDir(dist, staticDir);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(staticDir)) {
  const rel = path.relative(staticDir, file).replace(/\\/g, '/');
  if (rel === 'index.html') continue;
  if (rel.startsWith('assets/vendor/')) continue;
  if (/^assets\/index-.*\.(js|css|map)$/i.test(rel)) continue;
  if (!/\.(html|js|css)$/i.test(file)) continue;

  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  s = s.replace(/(?<!academic)\/api\/v1/g, '/academic/api/v1');
  s = s.replace(/(?<!academic)\/uploads\//g, '/academic/uploads/');
  s = s.replace(/(?<!academic)\/assets\//g, '/academic/assets/');
  s = s.replace(/(href|src)="\/(?!\/|academic\/)/g, '$1="/academic/');
  s = s.replace(/location\.replace\((['"])\/\1\)/g, "location.replace('/academic/')");
  s = s.replace(/location\.href\s*=\s*(['"])\/\1/g, "location.href = '/academic/'");
  s = s.replace('/^\\/login\\/?$/', '/^\\/academic\\/login\\/?$/');
  if (s !== before) {
    fs.writeFileSync(file, s);
    changed++;
  }
}

console.log(`postbuild: static -> ${staticDir}, patched ${changed} file(s)`);
