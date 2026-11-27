/* ===== 明月学术 · 富文档阅读器 + 编辑器（mingyue-doc-viewer.js）=====
   依赖: vendor/marked.min.js, vendor/katex.min.js, vendor/auto-render.min.js, vendor/purify.min.js
   行为: 在 /resources/:id 详情页，对 document 类资源渲染 Markdown+LaTeX 正文；
         资源本人/超管可点"编辑正文"打开双栏实时预览编辑器保存。 */
(function () {
  if (window.__mqDocViewer) return;
  window.__mqDocViewer = true;

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function token() { try { return localStorage.getItem('token') || ''; } catch (e) { return ''; } }

  function api(path, opt) {
    opt = opt || {};
    var h = opt.headers || {};
    var t = token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    if (opt.body && !(opt.body instanceof FormData) && !h['Content-Type']) h['Content-Type'] = 'application/json';
    return fetch('/academic/api/v1' + path, { method: opt.method || 'GET', headers: h, body: opt.body })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (d) {
          if (!r.ok) { var e = new Error((d && (d.detail || d.message)) || ('请求失败 HTTP ' + r.status)); e.status = r.status; throw e; }
          return d;
        });
      });
  }

  function toast(msg) {
    var el = document.querySelector('.mq-toast');
    if (!el) { el = document.createElement('div'); el.className = 'mq-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* 公式预处理（修正三个真实坑）：
     1. \( ... \) / \[ ... \] ：marked 会把反斜杠当转义吃掉，先换成 $ / $$
     2. 多行 $$ 块：编辑器里常写成顶行 $$、公式独占中间行、底行 $$，
        而 marked 的 breaks 选项会把它换成 <br>，导致整块公式渲染不出来 —— 先折叠成单行
     3. 行中间的 $$ ... $$ ：KaTeX 的 $$ 是 display 模式，会强制独占一行，
        这正是“公式没办法在一行文字中间显示”的原因；前后都有正文时降级为行内 $ ... $。
        单独占一行的 $$ 仍保持块级居中。 */
  function preprocessMath(md) {
    if (!md) return '';
    // 1) 反斜杠定界符
    md = md.replace(/\\\(([\s\S]+?)\\\)/g, function (m, p) { return '$' + p + '$'; });
    md = md.replace(/\\\[([\s\S]+?)\\\]/g, function (m, p) { return '$$' + p + '$$'; });
    // 2) 折叠 $$ 内部换行，使其成为单行公式块
    md = md.replace(/\$\$([\s\S]*?)\$\$/g, function (m, p) {
      return '$$' + String(p).replace(/[ \t]*\r?\n[ \t]*/g, ' ').trim() + '$$';
    });
    // 3) 行中间的块级公式 → 行内公式
    md = md.replace(/^(.*?\S)[ \t]*\$\$([^$\n]+?)\$\$[ \t]*(\S.*)$/gm,
      function (m, a, f, b) { return a + ' $' + f + '$ ' + b; });
    return md;
  }

  function renderMarkdown(md) {
    var html = '';
    try {
      if (window.marked) {
        marked.setOptions({ gfm: true, breaks: true });
        html = marked.parse(preprocessMath(md));
      } else html = '<p style="color:#cf1322">渲染库未加载（marked 缺失）</p>';
    } catch (e) { html = '<p style="color:#cf1322">Markdown 解析出错：' + String(e && e.message || e) + '</p>'; }
    try { if (window.DOMPurify) html = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }); } catch (e) { }
    var div = document.createElement('div');
    div.innerHTML = html;
    // 子路径部署：正文里遗留的 /uploads/ 图片/链接统一指向 /academic/uploads/
    try {
      var nodes = div.querySelectorAll('img[src^="/uploads/"], a[href^="/uploads/"]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var attr = el.tagName === 'IMG' ? 'src' : 'href';
        el.setAttribute(attr, '/academic' + el.getAttribute(attr));
      }
    } catch (e) { }
    try {
      if (window.renderMathInElement) renderMathInElement(div, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false
      });
    } catch (e) { }
    return div.innerHTML;
  }

  /* ---------- 编辑器 ---------- */
  function insertAtCursor(ta, before, mid, after) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var sel = v.slice(s, e) || (mid || '');
    var nl = before.charAt(0) === '\n' ? '\n' : '';
    ta.value = v.slice(0, s) + nl + before + sel + (after || '') + v.slice(e);
    var pos = s + nl.length + before.length + sel.length + (after || '').length;
    ta.focus(); ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function openEditor(data, initialMd, onSaved, saveFn) {
    var mask = document.createElement('div');
    mask.className = 'mq-editor-mask';
    var ed = document.createElement('div');
    ed.className = 'mq-editor';
    ed.innerHTML =
      '<div class="mq-editor-head"><strong>' + (data.heading || '编辑正文') + ' · ' + esc(data.title) + '</strong>' +
      '<span class="mq-hint">支持 Markdown 与 LaTeX 公式（$...$ 行内 / $$...$$ 块级），Ctrl+Enter 保存</span>' +
      '<button class="mq-edit-btn mq-cancel" type="button">取消</button>' +
      '<button class="mq-edit-btn primary mq-save" type="button">保存</button></div>' +
      '<div class="mq-tb">' +
      '<button data-s="H2" title="二级标题">H2</button><button data-s="H3" title="三级标题">H3</button><span class="sep"></span>' +
      '<button data-s="B" title="加粗">B</button><button data-s="I" title="斜体"><i>I</i></button><button data-s="CODE" title="行内代码">&lt;/&gt;</button><span class="sep"></span>' +
      '<button data-s="PRE" title="代码块">{ }</button><button data-s="QUOTE" title="引用">❝</button><button data-s="UL" title="无序列表">• 列表</button><button data-s="OL" title="有序列表">1. 列表</button><span class="sep"></span>' +
      '<button data-s="LINK" title="链接">🔗</button><button data-s="IMG" title="图片">🖼</button><button data-s="TABLE" title="表格">⊞</button><span class="sep"></span>' +
      '<button data-s="INLINE_EQ" title="行内公式">E=mc²</button><button data-s="BLOCK_EQ" title="块级公式">Σ</button><button data-s="HR" title="分割线">—</button>' +
      '</div>' +
      '<div class="mq-editor-body"><textarea spellcheck="false" placeholder="在这里用 Markdown 写作…&#10;&#10;支持：标题、列表、表格、引用、代码块；&#10;行内公式 $E=mc^2$，块级公式：&#10;$$\\int_0^1 x^2 dx = \\frac{1}{3}$$"></textarea>' +
      '<div class="mq-editor-preview"></div></div>' +
      '<div class="mq-editor-foot"><span class="mq-status">编辑中…</span>' +
      '<span style="font-size:12px;color:#8a76a6">最近保存：—</span></div>';
    mask.appendChild(ed);
    document.body.appendChild(mask);

    var ta = ed.querySelector('textarea');
    var pv = ed.querySelector('.mq-editor-preview');
    var st = ed.querySelector('.mq-status');
    ta.value = initialMd || '';

    var SNIPPETS = {
      H2: ['\n## ', '二级标题', '\n'],
      H3: ['\n### ', '三级标题', '\n'],
      B: ['**', '加粗文字', '**'],
      I: ['*', '斜体文字', '*'],
      CODE: ['`', 'code', '`'],
      PRE: ['\n```\n', '// 代码', '\n```\n'],
      QUOTE: ['\n> ', '引用内容', '\n'],
      UL: ['\n- ', '列表项', '\n'],
      OL: ['\n1. ', '列表项', '\n'],
      LINK: ['[', '链接文字', '](https://)'],
      IMG: ['![', '图片描述', '](/academic/uploads/图片地址)'],
      TABLE: ['\n| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n'],
      INLINE_EQ: ['$', 'x^2', '$'],
      BLOCK_EQ: ['\n$$\n', '\\int_0^1 x^2\\,dx = \\frac{1}{3}', '\n$$\n'],
      HR: ['\n---\n', '', '']
    };
    ed.querySelectorAll('.mq-tb button[data-s]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = SNIPPETS[b.getAttribute('data-s')];
        if (s) insertAtCursor(ta, s[0], s[1], s[2]);
      });
    });

    var deb = null;
    function refreshPreview() {
      st.textContent = '编辑中…'; st.className = 'mq-status';
      pv.innerHTML = renderMarkdown(ta.value);
    }
    ta.addEventListener('input', function () {
      clearTimeout(deb);
      deb = setTimeout(refreshPreview, 260);
    });
    ta.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); doSave(); }
      if (ev.key === 'Escape') close();
    });
    refreshPreview();

    var saving = false;
    function doSave() {
      if (saving) return;
      var md = ta.value;
      if (!md.trim()) { st.textContent = '正文不能为空'; st.className = 'mq-status err'; return; }
      saving = true;
      st.textContent = '保存中…'; st.className = 'mq-status';
      var p = saveFn
        ? saveFn(md)
        : api('/resources/' + data.id, { method: 'PUT', body: JSON.stringify({ content: md }) });
      Promise.resolve(p)
        .then(function () {
          saving = false;
          st.textContent = '✓ 已保存'; st.className = 'mq-status ok';
          toast('正文已保存');
          if (onSaved) onSaved(md);
          close();
        })
        .catch(function (e) {
          saving = false;
          st.textContent = '✗ ' + e.message; st.className = 'mq-status err';
          toast('保存失败：' + e.message);
        });
    }
    function close() {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      document.removeEventListener('keydown', escH);
    }
    function escH(ev) { if (ev.key === 'Escape') close(); }
    document.addEventListener('keydown', escH);
    mask.addEventListener('click', function (ev) { if (ev.target === mask) close(); });
    ed.querySelector('.mq-cancel').addEventListener('click', close);
    ed.querySelector('.mq-save').addEventListener('click', doSave);
    ta.focus();
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- 对外暴露编辑器（供“写文档”入口复用） ---------- */
  window.mqOpenEditor = openEditor;
  window.mqRenderMarkdown = renderMarkdown;
  window.mqPreprocessMath = preprocessMath;

  /* ---------- 详情页正文注入 ---------- */
  var curId = null;
  function pathId() { var m = location.pathname.match(/^\/resources\/(\d+)/); return m ? +m[1] : null; }

  function handleDetail() {
    var id = pathId();
    if (!id || id === curId) return;
    curId = id;
    document.querySelectorAll('.mq-doc-shell').forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });

    var data = null;
    (function load(attempt) {
      api('/resources/' + id).then(function (d) { data = d; }).catch(function () {
        if (attempt < 6) { setTimeout(function () { load(attempt + 1); }, 500); }
      }).then(function () {
        if (!data) return;
        injectAttCard(data);
        if (data.resource_type !== 'document') return;
        var md = data.content || '';
        var isTextFile = /\.(md|markdown|txt)$/i.test(data.file_path || '');
        var fetched = false;
        (function maybeFetch() {
          if ((!md || !md.trim()) && isTextFile) {
            fetch('/academic/uploads/' + data.file_path).then(function (r) { return r.text(); })
              .then(function (t) { md = t; fetched = true; build(); })
              .catch(function () { build(); });
          } else build();
        })();
        function build() {
          var waitH1 = function (n, cb) {
            var h1s = Array.prototype.slice.call(document.querySelectorAll('h1'));
            var h1 = h1s.filter(function (x) { return (x.textContent || '').trim() === (data.title || '').trim(); })[0] || h1s[0];
            if (!h1) { if (n < 24) setTimeout(function () { waitH1(n + 1, cb); }, 250); return; }
            cb(h1);
          };
          if (!md || !md.trim()) {
            // 文件型文档：PDF 内联预览；其他二进制格式给「文件卡」（原来只有下载链接、无预览）
            var fp = data.file_path || '';
            if (/\.pdf$/i.test(fp)) { waitH1(0, injectPdf); return; }
            if (fp) { waitH1(0, injectFileCard); return; }
            return;
          }
          waitH1(0, inject);
        }

        function fmtSize(b) {
          if (b === null || b === undefined || b === '') return '';
          b = +b; if (isNaN(b)) return '';
          if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
          if (b >= 1024) return Math.round(b / 1024) + ' KB';
          return b + ' B';
        }

        // 附件区（任何类型的资源都可带附件：链接/文件）
        function injectAttCard(data) {
          var list = data.attachments || [];
          if (!list.length) return;
          if (document.querySelector('.mq-att-card')) return;
          (function wait(n) {
            var h1s = Array.prototype.slice.call(document.querySelectorAll('h1'));
            var h1 = h1s.filter(function (x) { return (x.textContent || '').trim() === (data.title || '').trim(); })[0] || h1s[0];
            if (!h1) { if (n < 24) setTimeout(function () { wait(n + 1); }, 250); return; }
            var rows = list.map(function (a, i) {
              var isFile = a.kind === 'file';
              var href = isFile ? ('/academic/uploads/' + a.file_path) : (a.url || '#');
              var meta = isFile ? (fmtSize(a.file_size) || '文件') : '链接';
              return '<a class="mq-att-item ' + (isFile ? 'file' : 'link') + '" href="' + esc(href) + '"' +
                (isFile ? ' download' : ' target="_blank" rel="noopener"') + '>' +
                '<span class="mq-att-ic">' + (isFile ? '📎' : '🔗') + '</span>' +
                '<span class="mq-att-name">' + esc(a.name || ('附件 ' + (i + 1))) + '</span>' +
                '<span class="mq-att-meta">' + meta + '</span></a>';
            }).join('');
            var card = document.createElement('div');
            card.className = 'mq-att-card';
            card.innerHTML = '<div class="mq-att-head"><span class="mq-att-title">附件</span>' +
              '<span class="mq-att-count">' + list.length + ' 项</span></div>' +
              '<div class="mq-att-body">' + rows + '</div>';
            var shell = document.querySelector('.mq-doc-shell');
            if (shell) shell.insertAdjacentElement('afterend', card);
            else h1.parentElement.insertAdjacentElement('afterend', card);
          })(0);
        }

        // PDF：内联预览（浏览器原生 PDF 阅读器）+ 下载按钮
        function injectPdf(h1) {
          var shell = document.createElement('div');
          shell.className = 'mq-doc-shell mq-doc-shell-pdf';
          var tb = document.createElement('div'); tb.className = 'mq-doc-toolbar';
          var tag = document.createElement('span'); tag.className = 'mq-doc-tag';
          tag.textContent = '预览 · PDF';
          var dl = document.createElement('a');
          dl.className = 'mq-edit-btn primary';
          dl.textContent = '下载文件' + (data.file_size ? ' · ' + fmtSize(data.file_size) : '');
          dl.href = '/academic/uploads/' + data.file_path;
          dl.setAttribute('download', '');
          dl.setAttribute('target', '_blank');
          var wrap = document.createElement('div'); wrap.className = 'mq-pdf-wrap';
          var obj = document.createElement('object');
          obj.className = 'mq-pdf-frame';
          obj.type = 'application/pdf';
          obj.setAttribute('data', '/academic/uploads/' + data.file_path + '#view=FitH&toolbar=1');
          obj.setAttribute('aria-label', data.title || 'PDF 预览');
          var fb = document.createElement('div'); fb.className = 'mq-pdf-fallback';
          fb.innerHTML = '<div style="font-size:34px">📄</div>' +
            '<p>当前浏览器未启用内置 PDF 预览</p>';
          var fbl = document.createElement('a');
          fbl.className = 'mq-edit-btn primary'; fbl.textContent = '在新窗口打开 PDF';
          fbl.href = '/academic/uploads/' + data.file_path; fbl.target = '_blank'; fbl.rel = 'noopener';
          fb.appendChild(fbl);
          obj.appendChild(fb);
          wrap.appendChild(obj);
          tb.appendChild(tag); tb.appendChild(dl);
          shell.appendChild(tb); shell.appendChild(wrap);
          h1.parentElement.insertAdjacentElement('afterend', shell);
        }

        // 其他二进制文件（docx/xlsx/zip…）：文件卡
        function injectFileCard(h1) {
          var fp = data.file_path || '';
          var ext = (fp.split('.').pop() || 'FILE').toUpperCase();
          var name = fp.split('/').pop() || 'file';
          var shell = document.createElement('div');
          shell.className = 'mq-doc-shell mq-doc-shell-file';
          var tb = document.createElement('div'); tb.className = 'mq-doc-toolbar';
          var tag = document.createElement('span'); tag.className = 'mq-doc-tag';
          tag.textContent = '文件 · ' + ext;
          tb.appendChild(tag);
          var box = document.createElement('div'); box.className = 'mq-file-card';
          var ic = document.createElement('div'); ic.className = 'mq-file-ic'; ic.textContent = ext;
          var info = document.createElement('div'); info.className = 'mq-file-info';
          var nm = document.createElement('div'); nm.className = 'mq-file-name'; nm.textContent = name;
          var mt = document.createElement('div'); mt.className = 'mq-file-meta';
          mt.textContent = ext + (data.file_size ? ' · ' + fmtSize(data.file_size) : '') + ' · 该格式暂不支持在线预览';
          info.appendChild(nm); info.appendChild(mt);
          var dl = document.createElement('a');
          dl.className = 'mq-edit-btn primary';
          dl.textContent = '下载文件';
          dl.href = '/academic/uploads/' + fp; dl.setAttribute('download', '');
          box.appendChild(ic); box.appendChild(info); box.appendChild(dl);
          shell.appendChild(tb); shell.appendChild(box);
          h1.parentElement.insertAdjacentElement('afterend', shell);
        }

        function inject(h1) {
          api('/auth/me').then(function (me) {
            var canEdit = me && (me.id === data.uploader_id || me.role === 'super_admin');
            var shell = document.createElement('div');
            shell.className = 'mq-doc-shell';
            var tb = document.createElement('div'); tb.className = 'mq-doc-toolbar';
            var tag = document.createElement('span'); tag.className = 'mq-doc-tag';
            tag.textContent = isTextFile && !(data.content || '').trim() ? '正文 · 已从文件导入' : '正文 · Markdown';
            tb.appendChild(tag);
            if (canEdit) {
              var b = document.createElement('button');
              b.className = 'mq-edit-btn'; b.textContent = '✎ 编辑正文';
              b.addEventListener('click', function () {
                // 跳转整页写作工作台（带自动保存 / 插图 / 表格）
                location.href = '/editor.html?id=' + data.id;
              });
              tb.appendChild(b);
            }
            var body = document.createElement('div'); body.className = 'mq-doc-body';
            body.innerHTML = renderMarkdown(md);
            shell.appendChild(tb); shell.appendChild(body);
            h1.parentElement.insertAdjacentElement('afterend', shell);
          }).catch(function () { });
        }
      });
    })(0);
  }

  /* ---------- 路由轮询（兼容 react-router pushState） ---------- */
  var lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) { lastPath = location.pathname; curId = null; handleDetail(); }
  }, 400);
  window.addEventListener('popstate', function () { curId = null; handleDetail(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleDetail);
  } else handleDetail();
})();
