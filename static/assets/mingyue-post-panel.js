/* ===== 明月学术 · 发布资源（文字 + 附件）2026-09-15 =====
   规则（老大定）：资源主体 = 正文文字；链接 / 文件不能单独提交，
   只能作为「附件」挂在该资源下。本脚本在 /upload 页隐藏 React 原表单，
   注入新的「标题 + 正文 + 附件区 + 团队/分区/可见范围」面板，直接调 API。*/
(function () {
  if (window.__mqPostPanel) return;
  window.__mqPostPanel = true;

  var MAX_SIZE = 550 * 1024 * 1024;
  function token() { try { return localStorage.getItem('token') || ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtSize(n) {
    n = +n || 0;
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }
  function api(path, opt) {
    opt = opt || {};
    var h = opt.headers || {};
    var t = token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    if (opt.body && !(opt.body instanceof FormData) && !h['Content-Type']) h['Content-Type'] = 'application/json';
    return fetch('/academic/api/v1' + path, { method: opt.method || 'GET', headers: h, body: opt.body })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (d) {
        if (!r.ok) { var e = new Error((d && (d.detail || d.message)) || ('请求失败 HTTP ' + r.status)); e.status = r.status; throw e; }
        return d;
      }); });
  }
  function toast(msg, ms) {
    var el = document.querySelector('.mq-toast');
    if (!el) { el = document.createElement('div'); el.className = 'mq-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, ms || 3000);
  }

  var PANEL_ID = 'mq-post-panel';
  function cleanup() {
    var p = document.getElementById(PANEL_ID);
    if (p) p.parentNode.removeChild(p);
    document.querySelectorAll('form.mq-hidden-form').forEach(function (f) { f.style.display = ''; f.classList.remove('mq-hidden-form'); });
    var inp = document.getElementById('mq-post-file-input');
    if (inp && inp.parentNode) inp.parentNode.removeChild(inp);
  }

  function findPage() {
    if (location.pathname !== '/upload' || !token()) { cleanup(); return; }
    if (document.getElementById(PANEL_ID)) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var form = document.querySelector('main form') || document.querySelector('form');
      if (form) { clearInterval(timer); build(form); return; }
      if (tries > 80 || location.pathname !== '/upload') clearInterval(timer);
    }, 300);
  }

  function build(form) {
    // 隐藏 React 原表单，避免与「不能单独提交文件」冲突
    form.classList.add('mq-hidden-form');
    form.style.display = 'none';

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'mq-post';
    panel.innerHTML =
      '<div class="mq-post-head"><strong>发布资源</strong>' +
      '<span class="mq-post-tip">正文文字 + 附件（链接 / 文件，可多个）——附件不能单独提交</span></div>' +
      '<label class="mq-fld"><span>资源标题 <i>*</i></span>' +
      '<input type="text" class="mq-post-title" maxlength="200" placeholder="例如：视觉组——相机标定与畸变校正笔记"></label>' +
      '<label class="mq-fld"><span>正文 <i>*</i></span>' +
      '<textarea class="mq-post-body" rows="8" placeholder="在这里写正文（支持 Markdown 与 $LaTeX$ 公式）。链接与文件请添加为下方附件。"></textarea></label>' +
      '<div class="mq-post-atts">' +
      '  <div class="mq-post-atts-head"><strong>附件</strong>' +
      '    <span class="mq-post-atts-hint">可添加多个链接 / 文件</span>' +
      '    <button type="button" class="mq-mini mq-add-link">🔗 添加链接</button>' +
      '    <button type="button" class="mq-mini mq-add-file">📎 添加文件</button>' +
      '  </div>' +
      '  <div class="mq-post-atts-list"></div>' +
      '  <div class="mq-post-atts-empty">还没有附件。纯文字也可以直接发布。</div>' +
      '</div>' +
      '<div class="mq-post-targets">' +
      '  <label>所属团队 <select class="mq-post-team"><option value="">加载中…</option></select></label>' +
      '  <label>所属分区 <select class="mq-post-part"><option value="">不选择分区（可选）</option></select></label>' +
      '  <label>可见范围 <select class="mq-post-vis"><option value="public">公开 · 所有人可见</option><option value="team_only">仅团队 · 团队成员可见</option></select></label>' +
      '</div>' +
      '<div class="mq-post-foot"><button type="button" class="mq-post-go">发布资源</button>' +
      '<span class="mq-post-status"></span></div>';

    var anchor = form.parentElement;
    anchor.insertBefore(panel, form.nextSibling);

    var titleEl = panel.querySelector('.mq-post-title');
    var bodyEl = panel.querySelector('.mq-post-body');
    var teamSel = panel.querySelector('.mq-post-team');
    var partSel = panel.querySelector('.mq-post-part');
    var visSel = panel.querySelector('.mq-post-vis');
    var listEl = panel.querySelector('.mq-post-atts-list');
    var emptyEl = panel.querySelector('.mq-post-atts-empty');
    var goBtn = panel.querySelector('.mq-post-go');
    var stEl = panel.querySelector('.mq-post-status');

    // 隐藏的多选文件输入
    var fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.multiple = true; fileInput.style.display = 'none';
    fileInput.id = 'mq-post-file-input';
    document.body.appendChild(fileInput);

    var atts = []; // {kind:'link'|'file', name, url, file_path, file_size, state, err, _file}

    // ---- 团队 / 分区 ----
    Promise.all([api('/auth/me').catch(function () { return null; }), api('/teams').catch(function () { return []; })])
      .then(function (res) {
        var me = res[0], list = res[1] || [];
        var isAdmin = me && me.role === 'super_admin';
        var allowed = null;
        if (me && !isAdmin) { allowed = {}; (me.team_memberships || []).forEach(function (m) { allowed[m.team_id] = true; }); }
        var teams = (list || []).filter(function (t) { return !allowed || allowed[t.id]; });
        if (!teams.length) teamSel.innerHTML = '<option value="">你还没有可发布的团队</option>';
        else teamSel.innerHTML = '<option value="">选择团队</option>' + teams.map(function (t) {
          return '<option value="' + t.id + '">' + esc(t.name) + '</option>';
        }).join('');
      }).catch(function () { teamSel.innerHTML = '<option value="">团队加载失败</option>'; });
    api('/partitions/tree').then(function (tree) {
      var opts = '';
      (function flat(nodes, depth) {
        (nodes || []).forEach(function (n) {
          opts += '<option value="' + n.id + '">' + '　'.repeat(depth) + esc(n.name) + '</option>';
          flat(n.children || [], depth + 1);
        });
      })(tree || [], 0);
      partSel.innerHTML = '<option value="">不选择分区（可选）</option>' + opts;
    }).catch(function () { });

    // ---- 附件渲染 ----
    function renderAtts() {
      listEl.innerHTML = '';
      atts.forEach(function (a, idx) {
        var row = document.createElement('div');
        row.className = 'mq-att-row ' + a.kind;
        if (a.kind === 'link') {
          row.innerHTML =
            '<span class="ic">🔗</span>' +
            '<input type="text" class="an" placeholder="链接名称（可选）" value="' + esc(a.name || '') + '">' +
            '<input type="text" class="au" placeholder="https://…" value="' + esc(a.url || '') + '">' +
            '<button type="button" class="rm" title="移除">✕</button>';
          row.querySelector('.an').addEventListener('input', function () { a.name = this.value; });
          row.querySelector('.au').addEventListener('input', function () { a.url = this.value; });
        } else {
          var stTxt = a.state === 'run' ? '⏳ 上传中…' : (a.state === 'err' ? '✗ ' + (a.err || '失败') : (a.file_size ? fmtSize(a.file_size) : ''));
          row.innerHTML =
            '<span class="ic">📎</span>' +
            '<input type="text" class="an" placeholder="附件名称" value="' + esc(a.name || '') + '">' +
            '<span class="asz ' + (a.state || '') + '">' + esc(stTxt) + '</span>' +
            '<button type="button" class="rm" title="移除">✕</button>';
          row.querySelector('.an').addEventListener('input', function () { a.name = this.value; });
        }
        row.querySelector('.rm').addEventListener('click', function () { atts.splice(idx, 1); renderAtts(); });
        listEl.appendChild(row);
      });
      var show = atts.length > 0;
      emptyEl.style.display = show ? 'none' : '';
    }

    panel.querySelector('.mq-add-link').addEventListener('click', function () {
      atts.push({ kind: 'link', name: '', url: '' });
      renderAtts();
      var rows = listEl.querySelectorAll('.mq-att-row.link .au');
      var last = rows[rows.length - 1]; if (last) last.focus();
    });
    panel.querySelector('.mq-add-file').addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', function () {
      var sel = Array.prototype.slice.call(fileInput.files || []);
      fileInput.value = '';
      var bad = [];
      sel.forEach(function (f) {
        if (f.size > MAX_SIZE) { bad.push(f.name + '（超过 550MB）'); return; }
        atts.push({
          kind: 'file', _file: f, name: f.name.replace(/\.[^.]+$/, ''),
          file_path: '', file_size: f.size, state: 'run', err: ''
        });
      });
      if (bad.length) toast('已跳过 ' + bad.length + ' 个文件：' + bad.slice(0, 3).join('、'));
      renderAtts();
      // 逐个上传
      sel.forEach(function (f) {
        var a = atts.filter(function (x) { return x._file === f; })[0];
        if (!a) return;
        var fd = new FormData(); fd.append('file', f);
        api('/resources/upload', { method: 'POST', body: fd })
          .then(function (up) { a.file_path = up.file_path; a.file_size = up.file_size || f.size; a.state = 'ok'; renderAtts(); })
          .catch(function (e) {
            a.state = 'err'; a.err = (e.message || '失败').slice(0, 40);
            // 扩展名不符 → 后端拒绝
            toast('文件「' + f.name + '」上传失败：' + a.err, 4000);
            renderAtts();
          });
      });
    });

    // ---- 发布 ----
    var posting = false;
    goBtn.addEventListener('click', function () {
      if (posting) return;
      var title = (titleEl.value || '').trim();
      var body = (bodyEl.value || '').trim();
      if (!title) { toast('请填写资源标题'); titleEl.focus(); return; }
      if (!body) { toast('请填写正文文字；链接或文件不能单独提交'); bodyEl.focus(); return; }
      if (!teamSel.value) { toast('请选择所属团队'); teamSel.focus(); return; }

      var busy = atts.filter(function (a) { return a.kind === 'file' && a.state === 'run'; });
      if (busy.length) { toast('还有文件正在上传，请稍候'); return; }
      var badFiles = atts.filter(function (a) { return a.kind === 'file' && a.state === 'err'; });
      if (badFiles.length) { toast('有 ' + badFiles.length + ' 个文件上传失败，请移除或重试'); return; }

      var cleanAtts = [];
      atts.forEach(function (a) {
        if (a.kind === 'link') {
          var url = (a.url || '').trim();
          if (!url) return;
          cleanAtts.push({ kind: 'link', name: (a.name || url).trim(), url: url });
        } else {
          if (!a.file_path) return;
          cleanAtts.push({ kind: 'file', name: (a.name || '附件').trim(), file_path: a.file_path, file_size: a.file_size || 0 });
        }
      });

      posting = true; goBtn.disabled = true; stEl.textContent = '发布中…'; stEl.className = 'mq-post-status';
      api('/resources', {
        method: 'POST',
        body: JSON.stringify({
          title: title,
          content: body,
          description: '',
          resource_type: 'document',
          team_id: +teamSel.value,
          partition_id: partSel.value ? +partSel.value : null,
          visibility: visSel.value || 'public',
          attachments: cleanAtts
        })
      }).then(function (d) {
        stEl.textContent = '✓ 已发布'; stEl.className = 'mq-post-status ok';
        toast('资源已发布' + (cleanAtts.length ? '（含 ' + cleanAtts.length + ' 个附件）' : ''));
        setTimeout(function () { if (location.pathname === '/upload') location.href = '/my-resources'; }, 1200);
      }).catch(function (e) {
        posting = false; goBtn.disabled = false;
        stEl.textContent = '✗ ' + e.message; stEl.className = 'mq-post-status err';
        toast('发布失败：' + e.message, 4000);
      });
    });

    renderAtts();
  }

  var lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (location.pathname === '/upload') findPage(); else cleanup();
    }
  }, 400);
  try {
    window.addEventListener('mq:authchange', function (e) {
      var logged = e && e.detail ? e.detail.loggedIn : !!token();
      if (!logged) cleanup();
      else if (location.pathname === '/upload') findPage();
    });
  } catch (err) {}
  if (location.pathname === '/upload') findPage();
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', findPage); else findPage();
})();
