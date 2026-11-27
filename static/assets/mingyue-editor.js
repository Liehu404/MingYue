/* ===== 明月学术 · 整页写文档工作台（mingyue-editor.js）=====
   独立页面 /editor.html：
     /editor.html          新建文档
     /editor.html?id=18    编辑已有文档
   依赖：marked / katex / auto-render / purify（vendor），以及 mingyue-doc-viewer.js
         暴露的 window.mqRenderMarkdown（含公式预处理）。
   能力：双栏实时预览、自动保存草稿（本机 + 服务端）、插入图片（上传/拖拽/粘贴）、
         插入表格（网格选择器）、公式、字数统计、草稿箱、提交审核。 */
(function () {
  'use strict';
  if (window.__mqEditor) return;
  window.__mqEditor = true;

  var API = '/academic/api/v1';
  var LS_PREFIX = 'mq_ed_draft:';

  /* ---------------- 基础工具 ---------------- */
  function token() { try { return localStorage.getItem('token') || ''; } catch (e) { return ''; } }

  function api(path, opt) {
    opt = opt || {};
    var h = opt.headers || {};
    var t = token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    if (opt.body && !(opt.body instanceof FormData) && !h['Content-Type']) h['Content-Type'] = 'application/json';
    return fetch(API + path, {
      method: opt.method || 'GET', headers: h, body: opt.body, keepalive: !!opt.keepalive
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().catch(function () { return null; }).then(function (d) {
        if (!r.ok) {
          if (r.status === 401) { location.replace('/login'); }
          var e = new Error((d && (d.detail || d.message)) || ('请求失败 HTTP ' + r.status));
          e.status = r.status;
          throw e;
        }
        return d;
      });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    var el = document.querySelector('.ed-toast');
    if (!el) { el = document.createElement('div'); el.className = 'ed-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function hhmmss(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function renderMarkdown(md) {
    if (window.mqRenderMarkdown) return window.mqRenderMarkdown(md);
    if (!window.marked) return '<p style="color:#cf1322">渲染库未加载</p>';
    var html = marked.parse(md || '');
    try { if (window.DOMPurify) html = DOMPurify.sanitize(html); } catch (e) { }
    return html;
  }

  /* ---------------- 状态 ---------------- */
  var S = {
    me: null,
    teams: [],
    allowedTeams: [],
    id: null,
    team_id: null,
    visibility: 'team_only',
    partition_id: null,
    partitions: [],
    dirty: false,
    saving: false,
    lastSavedAt: null,
    serverDirty: false,
    creating: false,
    uploaded: 0
  };

  var el = {};
  var wantPreview = true;

  /* ---------------- 载入数据 ---------------- */
  function loadTeams(me) {
    return api('/teams').then(function (list) {
      S.teams = Array.isArray(list) ? list : [];
      var byId = {};
      S.teams.forEach(function (t) { byId[t.id] = t; });
      var allowed;
      if (me.role === 'super_admin') {
        allowed = S.teams.map(function (t) { return t.id; });
      } else {
        allowed = (me.team_memberships || []).map(function (m) { return m.team_id; });
        S.teams.forEach(function (t) { if (t.advisor_teacher_id === me.id) allowed.push(t.id); });
      }
      S.allowedTeams = allowed.filter(function (id, i) { return allowed.indexOf(id) === i && byId[id]; });
      S.byId = byId;
    });
  }

  function loadPartitions() {
    return api('/partitions').then(function (list) {
      S.partitions = Array.isArray(list) ? list : [];
    }).catch(function () { S.partitions = []; });
  }

  /* ---------------- 界面骨架 ---------------- */
  function buildUI() {
    var teamsOpts = S.allowedTeams.map(function (id) {
      var t = S.byId[id] || {};
      return '<option value="' + id + '">' + esc(t.name || ('团队 ' + id)) + '</option>';
    }).join('');
    if (!teamsOpts) teamsOpts = '<option value="">（没有可发布到的团队）</option>';

    var partOpts = '<option value="">（不指定）</option>' + S.partitions.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');

    el.root.innerHTML =
      '<header class="ed-top">' +
        '<a class="ed-brand" href="/academic/">' +
          '<img src="/academic/assets/emblem-mark-white.png" alt="明月学术" onerror="this.style.display=\'none\'">' +
          '<span class="ed-brand-text"><span class="ed-brand-title">明月学术交流平台</span>' +
          '<span class="ed-brand-sub">MY RESEARCH OS · 写作工作台</span></span>' +
        '</a>' +
        '<div class="ed-titlewrap">' +
          '<input class="ed-title" id="ed-title" placeholder="文档标题（必填）" maxlength="200">' +
          '<span class="ed-badge" id="ed-badge">未保存</span>' +
        '</div>' +
        '<button class="ed-btn ghost" id="ed-drafts" type="button">草稿箱</button>' +
        '<button class="ed-btn" id="ed-save" type="button">保存草稿</button>' +
        '<button class="ed-btn primary" id="ed-submit" type="button">提交审核</button>' +
      '</header>' +

      '<div class="ed-meta">' +
        '<div class="ed-field"><label>所属团队</label><select id="ed-team">' + teamsOpts + '</select></div>' +
        '<div class="ed-field"><label>可见范围</label><select id="ed-vis">' +
          '<option value="team_only">仅团队可见</option>' +
          '<option value="public">公开</option>' +
        '</select></div>' +
        '<div class="ed-field"><label>分区</label><select id="ed-part">' + partOpts + '</select></div>' +
        '<div class="ed-spacer"></div>' +
        '<span class="ed-field" id="ed-ownerinfo"></span>' +
      '</div>' +

      '<main class="ed-main" id="ed-main">' +
        '<section class="ed-pane write">' +
          '<div class="ed-toolbar" id="ed-toolbar">' +
            '<button data-a="h2" title="二级标题">H2</button>' +
            '<button data-a="h3" title="三级标题">H3</button>' +
            '<span class="tb-sep"></span>' +
            '<button data-a="bold" title="加粗 Ctrl+B"><b>B</b></button>' +
            '<button data-a="italic" title="斜体 Ctrl+I"><i>I</i></button>' +
            '<button data-a="strike" title="删除线"><s>S</s></button>' +
            '<button data-a="code" title="行内代码">&lt;/&gt;</button>' +
            '<span class="tb-sep"></span>' +
            '<button data-a="quote" title="引用">❝</button>' +
            '<button data-a="ul" title="无序列表">• 列表</button>' +
            '<button data-a="ol" title="有序列表">1. 列表</button>' +
            '<button data-a="task" title="待办清单">☑ 待办</button>' +
            '<span class="tb-sep"></span>' +
            '<button data-a="link" title="链接">🔗 链接</button>' +
            '<button data-a="image" title="插入图片（也可直接拖拽/粘贴图片）">🖼 图片</button>' +
            '<button data-a="table" title="插入表格">⊞ 表格</button>' +
            '<button data-a="codeblock" title="代码块">{ }</button>' +
            '<button data-a="hr" title="分割线">—</button>' +
            '<span class="tb-sep"></span>' +
            '<button data-a="eq" title="行内公式">Σ 行内公式</button>' +
            '<button data-a="eqblock" title="块级公式">∑ 块级公式</button>' +
            '<span class="tb-spacer"></span>' +
            '<button data-a="toggle" class="tb-toggle" id="ed-toggle" title="切换预览">预览开</button>' +
          '</div>' +
          '<textarea class="ed-textarea" id="ed-content" spellcheck="false" ' +
            'placeholder="在这里用 Markdown 写作…&#10;&#10;· 公式：行内 $E=mc^2$，块级 $$\\int_0^1 x^2 dx$$（放在一行文字中间会按行内公式显示）&#10;· 图片：点工具条「🖼 图片」或直接把图片拖进来，也可以 Ctrl+V 粘贴&#10;· 表格：点「⊞ 表格」按网格选择行列&#10;· 快捷键：Ctrl+S 保存草稿，Ctrl+Enter 立即保存，Tab 缩进"></textarea>' +
          '<div class="ed-drop" id="ed-drop">松手即可上传图片</div>' +
        '</section>' +
        '<section class="ed-pane preview">' +
          '<div class="ed-panehead">实时预览' +
            '<span style="margin-left:auto;font-size:11px">正文 ' +
            '<span id="ed-previewcount">0</span> 字</span></div>' +
          '<article class="ed-preview" id="ed-preview"><div class="ed-empty">左侧开始写作，这里会实时渲染。</div></article>' +
        '</section>' +
      '</main>' +

      '<footer class="ed-foot">' +
        '<span id="ed-count">0 字</span>' +
        '<span id="ed-extra"></span>' +
        '<span class="ed-spacer"></span>' +
        '<span id="ed-savestate">尚未保存</span>' +
        '<span>Ctrl+S 保存 · Ctrl+Enter 立即保存 · Tab 缩进</span>' +
      '</footer>';

    el.title = document.getElementById('ed-title');
    el.content = document.getElementById('ed-content');
    el.preview = document.getElementById('ed-preview');
    el.badge = document.getElementById('ed-badge');
    el.team = document.getElementById('ed-team');
    el.vis = document.getElementById('ed-vis');
    el.part = document.getElementById('ed-part');
    el.count = document.getElementById('ed-count');
    el.extra = document.getElementById('ed-extra');
    el.previewCount = document.getElementById('ed-previewcount');
    el.saveState = document.getElementById('ed-savestate');
    el.main = document.getElementById('ed-main');
    el.toggle = document.getElementById('ed-toggle');
    el.drop = document.getElementById('ed-drop');
    el.toolbar = document.getElementById('ed-toolbar');
    el.ownerinfo = document.getElementById('ed-ownerinfo');

    el.ownerinfo.textContent = '作者：' + (S.me.display_name || S.me.username) +
      (S.id ? ' · 文档 #' + S.id : ' · 新文档');
  }

  /* ---------------- 光标/插入 ---------------- */
  function insertSnippet(before, mid, after) {
    var ta = el.content;
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var sel = v.slice(s, e) || (mid || '');
    var txt = before + sel + (after || '');
    ta.value = v.slice(0, s) + txt + v.slice(e);
    var pos = s + txt.length - (after || '').length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    markDirty(true);
    refreshPreviewSoon();
  }

  function insertText(txt, selectFrom, selectTo) {
    var ta = el.content;
    var s = ta.selectionStart, v = ta.value;
    ta.value = v.slice(0, s) + txt + v.slice(ta.selectionEnd);
    var p = s + (selectFrom == null ? txt.length : selectFrom);
    ta.focus();
    ta.setSelectionRange(p, s + (selectTo == null ? txt.length : selectTo));
    markDirty(true);
    refreshPreviewSoon();
  }

  var SNIPPETS = {
    h2: ['\n## ', '二级标题', '\n'],
    h3: ['\n### ', '三级标题', '\n'],
    bold: ['**', '加粗文字', '**'],
    italic: ['*', '斜体文字', '*'],
    strike: ['~~', '删除线文字', '~~'],
    code: ['`', 'code', '`'],
    quote: ['\n> ', '引用内容', '\n'],
    ul: ['\n- ', '列表项', '\n'],
    ol: ['\n1. ', '列表项', '\n'],
    task: ['\n- [ ] ', '待办事项', '\n'],
    link: ['[', '链接文字', '](https://)'],
    codeblock: ['\n```\n', '// 代码', '\n```\n'],
    hr: ['\n---\n', '', ''],
    eq: ['$', 'E = mc^2', '$'],
    eqblock: ['\n$$\n', '\\int_0^1 x^2\\,dx = \\frac{1}{3}', '\n$$\n']
  };

  var debPreview = null;
  function refreshPreviewSoon() {
    clearTimeout(debPreview);
    debPreview = setTimeout(refreshPreview, 180);
  }

  function refreshPreview() {
    var md = el.content.value;
    el.preview.innerHTML = renderMarkdown(md) || '<div class="ed-empty">左侧开始写作，这里会实时渲染。</div>';
    var stats = countStats(md);
    el.count.textContent = stats.chars + ' 字 · ' + stats.lines + ' 行 · 约 ' + stats.minutes + ' 分钟';
    el.previewCount.textContent = stats.chars;
  }

  function countStats(md) {
    var text = String(md || '');
    var noSpace = text.replace(/\s+/g, '');
    var cjk = (noSpace.match(/[\u4e00-\u9fa5]/g) || []).length;
    var words = (text.match(/[A-Za-z0-9_]+/g) || []).length;
    var chars = noSpace.length;
    var minutes = Math.max(1, Math.round((cjk / 350 + words / 200) || 1));
    return { chars: chars, lines: text.split('\n').length, minutes: minutes };
  }

  /* ---------------- 插入图片 ---------------- */
  function uploadImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('只支持图片文件'); return; }
    if (file.size > 20 * 1024 * 1024) { toast('图片超过 20MB'); return; }
    var fd = new FormData();
    fd.append('file', file);
    setBadge('saving', '图片上传中…');
    var ta = el.content;
    var marker = '\n![上传中…]()\n';
    var at = ta.selectionStart;
    ta.value = ta.value.slice(0, at) + marker + ta.value.slice(ta.selectionEnd);
    markDirty(true);
    refreshPreviewSoon();

    api('/resources/upload', { method: 'POST', body: fd }).then(function (d) {
      var p = (d && (d.file_path || d.url || d.path)) || '';
      p = String(p);
      if (!p) throw new Error('服务器未返回图片地址');
      if (!/^https?:|^\//.test(p)) p = '/academic/uploads/' + p;
      var name = (file.name || 'image').replace(/[[\]]/g, '');
      var md = '![' + name + '](' + p + ')';
      ta.value = ta.value.replace(marker, md);
      markDirty(true);
      refreshPreviewSoon();
      setBadge('saving', '图片已插入，等待保存');
      toast('图片已插入');
    }).catch(function (e) {
      ta.value = ta.value.replace(marker, '');
      markDirty(true);
      refreshPreviewSoon();
      setBadge('err', '图片上传失败');
      toast('图片上传失败：' + e.message);
    });
  }

  /* ---------------- 表格选择器 ---------------- */
  function openTablePicker(anchor) {
    var pop = document.createElement('div');
    pop.className = 'ed-tblpop';
    var rows = 6, cols = 8, cell = '';
    var grid = '';
    for (var r = 1; r <= rows; r++) {
      for (var c = 1; c <= cols; c++) grid += '<i data-r="' + r + '" data-c="' + c + '"></i>';
    }
    pop.innerHTML = '<div class="tbl-hint">选择行列数</div><div class="ed-tblgrid">' + grid + '</div>';
    document.body.appendChild(pop);
    var rect = anchor.getBoundingClientRect();
    pop.style.top = (rect.bottom + 8) + 'px';
    pop.style.left = Math.min(rect.left, window.innerWidth - pop.offsetWidth - 16) + 'px';
    pop.style.position = 'fixed';

    function paint(r, c) {
      Array.prototype.forEach.call(pop.querySelectorAll('i'), function (i) {
        var on = (+i.getAttribute('data-r') <= r) && (+i.getAttribute('data-c') <= c);
        i.className = on ? 'on' : '';
      });
      pop.querySelector('.tbl-hint').textContent = r + ' 行 × ' + c + ' 列';
    }
    pop.addEventListener('mousemove', function (ev) {
      var t = ev.target;
      if (t.tagName === 'I') paint(+t.getAttribute('data-r'), +t.getAttribute('data-c'));
    });
    pop.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.tagName !== 'I') return;
      var r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
      var head = '| ' + Array.apply(null, Array(c)).map(function (_, i) { return '列' + (i + 1); }).join(' | ') + ' |';
      var sep = '| ' + Array.apply(null, Array(c)).map(function () { return '---'; }).join(' | ') + ' |';
      var body = '';
      for (var i = 1; i < r; i++) {
        body += '\n| ' + Array.apply(null, Array(c)).map(function () { return '　'; }).join(' | ') + ' |';
      }
      close();
      insertText('\n' + head + '\n' + sep + body + '\n');
    });
    function close() {
      if (pop.parentNode) pop.parentNode.removeChild(pop);
      document.removeEventListener('mousedown', outside, true);
    }
    function outside(ev) { if (!pop.contains(ev.target) && ev.target !== anchor) close(); }
    setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
  }

  /* ---------------- 保存 ---------------- */
  function setBadge(kind, text) {
    el.badge.className = 'ed-badge' + (kind ? ' ' + kind : '');
    el.badge.textContent = text;
  }

  function markDirty(fromInput) {
    S.dirty = true;
    S.serverDirty = true;
    setBadge('saving', '未保存的改动…');
    el.saveState.textContent = '有未保存的改动';
    if (fromInput) scheduleLocal();
    scheduleServer();
  }

  var debLocal = null;
  function scheduleLocal() {
    clearTimeout(debLocal);
    debLocal = setTimeout(saveLocal, 700);
  }

  function draftKey() { return LS_PREFIX + (S.id || 'new'); }

  function snapshot() {
    return {
      id: S.id,
      title: el.title.value,
      content: el.content.value,
      team_id: S.team_id,
      visibility: S.visibility,
      partition_id: S.partition_id,
      updatedAt: Date.now()
    };
  }

  function saveLocal() {
    try {
      var d = snapshot();
      if (!d.title && !d.content.trim()) return;
      localStorage.setItem(draftKey(), JSON.stringify(d));
      S.lastSavedAt = new Date();
    } catch (e) { }
  }

  function clearLocal() {
    try {
      localStorage.removeItem(draftKey());
      localStorage.removeItem(LS_PREFIX + 'new');
    } catch (e) { }
  }

  var debServer = null;
  function scheduleServer() {
    clearTimeout(debServer);
    // 已有服务器文档：10 秒自动保存一次
    // 新文档：标题+正文都写了，6 秒后自动建草稿并转为服务端自动保存
    debServer = setTimeout(function () {
      if (S.id) { saveServer(true); return; }
      if (el.title.value.trim() && el.content.value.trim().length > 0) saveServer(true);
    }, S.id ? 10000 : 6000);
  }

  function saveServer(silent) {
    if (S.saving) return Promise.resolve(false);
    var title = el.title.value.trim();
    var content = el.content.value;
    if (!S.id && !title) { if (!silent) toast('请先填写文档标题'); return Promise.resolve(false); }

    S.saving = true;
    setBadge('saving', '保存中…');
    el.saveState.textContent = '正在保存…';

    var p;
    if (S.id) {
      p = api('/resources/' + S.id, {
        method: 'PUT',
        body: JSON.stringify({ title: title, content: content, visibility: S.visibility, partition_id: S.partition_id })
      });
    } else {
      if (!S.team_id) {
        S.saving = false;
        setBadge('err', '请选择所属团队');
        if (!silent) toast('请先选择所属团队');
        return Promise.resolve(false);
      }
      p = api('/resources', {
        method: 'POST',
        body: JSON.stringify({
          team_id: S.team_id, title: title, content: content,
          resource_type: 'document', visibility: S.visibility, partition_id: S.partition_id
        })
      });
    }

    return Promise.resolve(p).then(function (d) {
      S.saving = false;
      S.dirty = false;
      S.serverDirty = false;
      S.lastSavedAt = new Date();
      if (!S.id && d && d.id) {
        S.id = d.id;
        try { history.replaceState(null, '', '/editor.html?id=' + d.id); } catch (e) { }
        clearLocal();
        el.ownerinfo.textContent = '作者：' + (S.me.display_name || S.me.username) + ' · 文档 #' + S.id;
      }
      setBadge('saved', '已保存');
      el.saveState.textContent = '已自动保存 · ' + hhmmss(S.lastSavedAt);
      saveLocal();
      if (!silent) toast('已保存');
      return true;
    }).catch(function (e) {
      S.saving = false;
      setBadge('err', '保存失败');
      el.saveState.textContent = '✗ ' + e.message;
      if (!silent) toast('保存失败：' + e.message);
      return false;
    });
  }

  /* ---------------- 草稿箱 ---------------- */
  function openDrafts() {
    var card = document.createElement('div');
    card.className = 'ed-modal';
    card.innerHTML = '<div class="ed-modal-card"><h3>草稿箱</h3>' +
      '<p class="sub">本机草稿会自动保留；服务端草稿可在「我的资源」里看到。</p>' +
      '<div id="ed-draftlist">正在读取…</div>' +
      '<div style="text-align:right;margin-top:14px"><button class="ed-btn" id="ed-draftclose" type="button">关闭</button></div>' +
      '</div>';
    document.body.appendChild(card);
    card.addEventListener('click', function (ev) { if (ev.target === card) card.remove(); });
    card.querySelector('#ed-draftclose').addEventListener('click', function () { card.remove(); });

    var list = card.querySelector('#ed-draftlist');
    var items = [];

    // 1) 本机草稿
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) {
          try {
            var d = JSON.parse(localStorage.getItem(k));
            if (d && (d.title || d.content)) items.push({ local: true, key: k, data: d });
          } catch (e) { }
        }
      }
    } catch (e) { }

    // 2) 服务端草稿
    api('/resources?my=1&status=draft&page_size=50').then(function (rows) {
      (rows || []).forEach(function (r) {
        items.push({
          local: false, id: r.id,
          data: { title: r.title, id: r.id, updatedAt: Date.parse(r.updated_at || '') || 0, content: '' }
        });
      });
      paint();
    }).catch(function () { paint(); });

    function paint() {
      if (!items.length) { list.innerHTML = '<p class="sub">还没有草稿。</p>'; return; }
      items.sort(function (a, b) { return (b.data.updatedAt || 0) - (a.data.updatedAt || 0); });
      list.innerHTML = items.map(function (it, idx) {
        var d = it.data;
        var when = d.updatedAt ? new Date(d.updatedAt).toLocaleString('zh-CN') : '—';
        var plain = String(d.content || '').replace(/[#>*`\-\[\]()!]/g, '').replace(/\s+/g, ' ').slice(0, 70);
        return '<div class="ed-draft" data-i="' + idx + '">' +
          '<span class="ed-tag">' + (it.local ? (d.id ? '本机' : '本机新稿') : '服务端') + '</span>' +
          '<div class="d-main"><div class="d-title">' + esc(d.title || '（无标题）') + '</div>' +
          '<div class="d-sub">' + esc(when) + (plain ? ' · ' + esc(plain) : '') + '</div></div>' +
          '<button class="d-del" data-del="' + idx + '" type="button">删除</button></div>';
      }).join('');
    }

    list.addEventListener('click', function (ev) {
      var del = ev.target.getAttribute && ev.target.getAttribute('data-del');
      if (del != null) {
        ev.stopPropagation();
        var it = items[+del];
        if (!it) return;
        if (it.local) {
          try { localStorage.removeItem(it.key); } catch (e) { }
          it.data.title = ''; // 标记移除
          items.splice(+del, 1);
          paint();
        } else {
          api('/resources/' + it.id, { method: 'DELETE' }).then(function () {
            items.splice(+del, 1); paint(); toast('已删除服务端草稿');
          }).catch(function (e) { toast('删除失败：' + e.message); });
        }
        return;
      }
      var row = ev.target.closest && ev.target.closest('.ed-draft');
      if (!row) return;
      var item = items[+row.getAttribute('data-i')];
      if (!item) return;
      card.remove();
      if (item.local) { applyDraft(item.data); toast('已载入本机草稿'); }
      else location.href = '/editor.html?id=' + item.id;
    });
  }

  function applyDraft(d) {
    if (d.title != null) el.title.value = d.title;
    if (d.content != null) el.content.value = d.content;
    if (d.team_id != null && el.team) el.team.value = String(d.team_id);
    if (d.visibility && el.vis) el.vis.value = d.visibility;
    if (d.partition_id && el.part) el.part.value = String(d.partition_id);
    S.team_id = el.team && el.team.value ? +el.team.value : S.team_id;
    S.visibility = el.vis ? el.vis.value : S.visibility;
    S.partition_id = el.part && el.part.value ? +el.part.value : null;
    refreshPreview();
  }

  /* ---------------- 载入文档 ---------------- */
  function loadDoc(id) {
    return api('/resources/' + id).then(function (d) {
      if (!d) throw new Error('文档不存在');
      if (d.resource_type !== 'document') throw new Error('该资源不是文档类型');
      if (d.uploader_id !== S.me.id && S.me.role !== 'super_admin') throw new Error('你没有编辑这篇文档的权限');
      S.id = d.id;
      S.team_id = d.team_id;
      S.visibility = d.visibility || 'team_only';
      S.partition_id = d.partition_id || null;
      S.status = d.status;
      el.title.value = d.title || '';
      el.content.value = d.content || '';
      if (el.team) el.team.value = String(d.team_id || '');
      if (el.vis) el.vis.value = S.visibility;
      if (el.part) el.part.value = S.partition_id ? String(S.partition_id) : '';
      el.ownerinfo.textContent = '作者：' + (S.me.display_name || S.me.username) +
        ' · 文档 #' + d.id + ' · ' + statusText(d.status);
      if (d.status === 'pending_review' || d.status === 'published') {
        el.submit.textContent = d.status === 'published' ? '已发布' : '审核中';
        el.submit.disabled = true;
      }
      refreshPreview();
      setBadge('saved', '已载入');
      el.saveState.textContent = '已载入服务器内容';
    });
  }

  function statusText(s) {
    return ({ draft: '草稿', pending_review: '审核中', reviewed: '待终审', published: '已发布', rejected: '已驳回' })[s] || s || '';
  }

  /* ---------------- 事件绑定 ---------------- */
  function wire() {
    el.title.addEventListener('input', function () { markDirty(true); });
    el.content.addEventListener('input', function () { markDirty(true); refreshPreviewSoon(); });

    el.team.addEventListener('change', function () {
      S.team_id = el.team.value ? +el.team.value : null;
      markDirty(true);
    });
    el.vis.addEventListener('change', function () { S.visibility = el.vis.value; markDirty(true); });
    el.part.addEventListener('change', function () {
      S.partition_id = el.part.value ? +el.part.value : null;
      markDirty(true);
    });

    document.getElementById('ed-save').addEventListener('click', function () { saveServer(false); });
    document.getElementById('ed-drafts').addEventListener('click', openDrafts);
    el.submit = document.getElementById('ed-submit');
    el.submit.addEventListener('click', function () {
      var title = el.title.value.trim();
      if (!title) { toast('请先填写文档标题'); el.title.focus(); return; }
      if (!el.content.value.trim()) { toast('正文不能为空'); el.content.focus(); return; }
      el.submit.disabled = true;
      saveServer(true).then(function (ok) {
        if (!ok || !S.id) { el.submit.disabled = false; return; }
        return api('/resources/' + S.id + '/submit', { method: 'POST' }).then(function () {
          toast('已提交审核');
          setTimeout(function () { location.href = '/resources/' + S.id; }, 700);
        });
      }).catch(function (e) {
        el.submit.disabled = false;
        toast('提交失败：' + e.message);
      });
    });

    // 工具条
    el.toolbar.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button[data-a]');
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'toggle') {
        wantPreview = !wantPreview;
        el.main.classList.toggle('hide-preview', !wantPreview);
        b.classList.toggle('on', wantPreview);
        b.textContent = wantPreview ? '预览开' : '预览关';
        return;
      }
      if (a === 'image') { pickImage(); return; }
      if (a === 'table') { openTablePicker(b); return; }
      var s = SNIPPETS[a];
      if (s) insertSnippet(s[0], s[1], s[2]);
    });

    // 快捷键
    document.addEventListener('keydown', function (ev) {
      var meta = ev.ctrlKey || ev.metaKey;
      if (meta && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveServer(false); return; }
      if (meta && ev.key === 'Enter') { ev.preventDefault(); saveServer(false); return; }
      if (meta && ev.key.toLowerCase() === 'b') { ev.preventDefault(); insertSnippet('**', '加粗文字', '**'); return; }
      if (meta && ev.key.toLowerCase() === 'i') { ev.preventDefault(); insertSnippet('*', '斜体文字', '*'); return; }
      if (ev.key === 'Tab' && ev.target === el.content) {
        ev.preventDefault();
        insertText('  ');
      }
    });

    // 拖拽 / 粘贴图片
    ['dragover', 'dragenter'].forEach(function (t) {
      el.content.addEventListener(t, function (ev) {
        if (ev.dataTransfer && Array.prototype.some.call(ev.dataTransfer.types || [], function (x) { return x === 'Files'; })) {
          ev.preventDefault();
          el.drop.classList.add('on');
        }
      });
    });
    el.content.addEventListener('dragleave', function () { el.drop.classList.remove('on'); });
    el.content.addEventListener('drop', function (ev) {
      if (!ev.dataTransfer || !ev.dataTransfer.files || !ev.dataTransfer.files.length) return;
      ev.preventDefault();
      el.drop.classList.remove('on');
      Array.prototype.forEach.call(ev.dataTransfer.files, uploadImage);
    });
    el.content.addEventListener('paste', function (ev) {
      var items = (ev.clipboardData && ev.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          ev.preventDefault();
          uploadImage(items[i].getAsFile());
          return;
        }
      }
    });

    // 离开前兜底保存（本机 + 服务端）
    window.addEventListener('beforeunload', function (ev) {
      if (!S.dirty) return;
      saveLocal();
      if (S.id && S.serverDirty) {
        try {
          fetch(API + '/resources/' + S.id, {
            method: 'PUT', keepalive: true,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
            body: JSON.stringify({ title: el.title.value.trim(), content: el.content.value })
          });
        } catch (e) { }
      }
      if (S.dirty) { ev.preventDefault(); ev.returnValue = ''; }
    });

    // 页面隐藏时保存一次
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && S.dirty) {
        saveLocal();
        if (S.id && S.serverDirty && !S.saving) saveServer(true);
      }
    });
  }

  function pickImage() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    inp.style.display = 'none';
    inp.addEventListener('change', function () {
      Array.prototype.forEach.call(inp.files, uploadImage);
      setTimeout(function () { inp.remove(); }, 0);
    });
    document.body.appendChild(inp);
    inp.click();
  }

  /* ---------------- 启动 ---------------- */
  function denied(msg, link) {
    el.root.innerHTML = '<div class="ed-denied"><h2>' + esc(msg) + '</h2>' +
      '<p>写文档需要登录后使用。</p>' +
      '<a class="ed-linkbtn" href="' + (link || '/login') + '">去登录</a></div>';
  }

  function boot() {
    el.root = document.getElementById('ed-root');
    if (!token()) { denied('请先登录', '/login'); return; }

    var id = qs('id');
    Promise.all([api('/auth/me'), api('/teams'), api('/partitions').catch(function () { return []; })])
      .then(function (res) {
        S.me = res[0];
        S.teams = Array.isArray(res[1]) ? res[1] : [];
        S.partitions = Array.isArray(res[2]) ? res[2] : [];
        S.byId = {};
        S.teams.forEach(function (t) { S.byId[t.id] = t; });

        var allowed;
        if (S.me.role === 'super_admin') {
          allowed = S.teams.map(function (t) { return t.id; });
        } else {
          allowed = (S.me.team_memberships || []).map(function (m) { return m.team_id; });
          S.teams.forEach(function (t) { if (t.advisor_teacher_id === S.me.id) allowed.push(t.id); });
        }
        S.allowedTeams = allowed.filter(function (v, i) { return allowed.indexOf(v) === i && S.byId[v]; });

        buildUI();
        wire();

        if (S.allowedTeams.length) { S.team_id = S.allowedTeams[0]; el.team.value = String(S.team_id); }

        if (id) {
          return loadDoc(+id).catch(function (e) {
            toast(e.message);
            setTimeout(function () { location.href = '/resources/' + id; }, 1200);
          });
        }

        // 新建：恢复本机草稿
        refreshPreview();
        try {
          var raw = localStorage.getItem(LS_PREFIX + 'new');
          if (raw) {
            var d = JSON.parse(raw);
            if (d && (d.title || d.content)) {
              applyDraft(d);
              setBadge('', '已恢复本机草稿');
              toast('已恢复上次未保存的草稿');
            }
          }
        } catch (e) { }
        if (el.title) el.title.focus();
      })
      .catch(function (e) {
        denied('加载失败：' + e.message);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
