/* ===== 明月学术 · 批量多文件上传增强（mingyue-upload-plus.js）=====
   在 /upload 页注入"批量上传"面板：多选文件 → 逐项编辑标题/类型 → 一键上传。
   复用后端单文件接口逐个提交，独立错误提示与重试。不侵入 React 原表单。 */
(function () {
  if (window.__mqUploadPlus) return;
  window.__mqUploadPlus = true;

  var ALLOW = {
    video: ['mp4', 'webm', 'mov', 'avi', 'mkv'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
    document: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'csv'],
    table: ['xls', 'xlsx', 'csv']
  };
  var MAX_SIZE = 550 * 1024 * 1024;
  var extType = function (name) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    for (var k in ALLOW) if (ALLOW[k].indexOf(ext) >= 0) return { type: k === 'document' && (ext === 'xls' || ext === 'xlsx' || ext === 'csv') ? 'table' : k, ext: ext };
    return null;
  };
  function fmtSize(n) {
    if (n >= 1024 * 1024 * 1024) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
    return Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function token() { try { return localStorage.getItem('token') || ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var ICONS = { video: '🎬', image: '🖼', document: '📄', table: '📊', link: '🔗' };

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

  function removePanel() {
    document.querySelectorAll('.mq-batch').forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });
    document.querySelectorAll('input.mq-batch-input').forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });
  }

  function findUploadPage() {
    // 仅登录用户可用（未登录时不注入，避免与登录态不一致）
    if (!token()) { removePanel(); return; }
    // 防重复构建
    if (document.querySelector('.mq-batch')) return;
    // 等待 /upload 页表单挂载
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var dropText = Array.prototype.slice.call(document.querySelectorAll('div,span,p'))
        .filter(function (x) { return x.childElementCount === 0 && /拖拽文件到此处或点击选择/.test(x.textContent || ''); })[0];
      if (dropText) { clearInterval(timer); build(dropText); return; }
      if (tries > 60 || location.pathname !== '/upload') clearInterval(timer);
    }, 350);
  }

  function build(dropText) {
    // 找上传表单容器：从拖拽文案向上找主卡片
    var card = dropText;
    for (var i = 0; i < 6 && card.parentElement; i++) card = card.parentElement;
    // 批量面板插到该卡片之后
    var panel = document.createElement('div');
    panel.className = 'mq-batch';
    panel.innerHTML =
      '<div class="mq-batch-head"><strong>批量上传</strong><span>一次选择多个文件，逐个上传为独立资源</span>' +
      '<button type="button" class="mq-batch-pick">＋ 选择多个文件</button></div>' +
      '<div class="mq-batch-targets" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:12.5px;color:#43305a">' +
      '<label>所属团队 <select class="mq-t-team" style="margin-left:4px"><option value="">加载中…</option></select></label>' +
      '<label>所属分区 <select class="mq-t-part" style="margin-left:4px"><option value="">不选择分区（可选）</option></select></label>' +
      '<label>可见范围 <select class="mq-t-vis" style="margin-left:4px"><option value="public">公开·所有人可见</option><option value="team_only">仅团队·团队成员可见</option></select></label>' +
      '</div>' +
      '<div class="mq-batch-empty">尚未选择文件。支持视频 / 图片 / PDF / Office / Markdown / 表格等格式，单文件 ≤ 550MB。</div>' +
      '<div class="mq-batch-list" style="display:none"></div>' +
      '<div class="mq-batch-foot" style="display:none">' +
      '<button type="button" class="mq-batch-go">开始上传</button>' +
      '<span class="mq-batch-summary"></span>' +
      '<span style="font-size:12px;color:#8a76a6">每个文件可单独改标题与类型；状态失败的可修改后重试。</span></div>';
    card.parentElement.insertBefore(panel, card.nextSibling);

    // 拉取团队与分区选项（按当前用户权限过滤：超管可见全部，其余仅本人所属团队）
    var teamSel = panel.querySelector('.mq-t-team');
    var partSel = panel.querySelector('.mq-t-part');
    Promise.all([
      api('/auth/me').catch(function () { return null; }),
      api('/teams').catch(function () { return []; })
    ]).then(function (res) {
      var me = res[0], list = res[1] || [];
      var isAdmin = me && me.role === 'super_admin';
      var allowed = null;
      if (me && !isAdmin) {
        allowed = {};
        (me.team_memberships || []).forEach(function (m) { allowed[m.team_id] = true; });
      }
      var teams = (list || []).filter(function (t) { return !allowed || allowed[t.id]; });
      if (!teams.length) {
        teamSel.innerHTML = '<option value="">你还没有可发布的团队</option>';
      } else {
        teamSel.innerHTML = '<option value="">选择团队</option>' + teams.map(function (t) {
          return '<option value="' + t.id + '">' + esc(t.name) + '</option>';
        }).join('');
      }
    }).catch(function () { teamSel.innerHTML = '<option value="">团队加载失败</option>'; });
    api('/partitions/tree').then(function (tree) {
      var opts = '';
      var flat = function (nodes, depth) {
        (nodes || []).forEach(function (n) {
          opts += '<option value="' + n.id + '">' + '　'.repeat(depth) + esc(n.name) + '</option>';
          flat(n.children || [], depth + 1);
        });
      };
      flat(tree || [], 0);
      partSel.innerHTML = '<option value="">不选择分区（可选）</option>' + opts;
    }).catch(function () { });

    var input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.style.display = 'none';
    input.className = 'mq-batch-input';
    document.body.appendChild(input);

    var listEl = panel.querySelector('.mq-batch-list');
    var emptyEl = panel.querySelector('.mq-batch-empty');
    var footEl = panel.querySelector('.mq-batch-foot');
    var goBtn = panel.querySelector('.mq-batch-go');
    var sumEl = panel.querySelector('.mq-batch-summary');
    var files = []; // {file, title, type, state, err}

    function ctx() {
      return {
        teamId: teamSel.value ? +teamSel.value : null,
        partId: partSel.value ? +partSel.value : null,
        visibility: panel.querySelector('.mq-t-vis').value || 'public'
      };
    }

    function render() {
      listEl.innerHTML = '';
      files.forEach(function (f, idx) {
        var row = document.createElement('div');
        row.className = 'mq-batch-row';
        var meta = extType(f.file.name);
        row.innerHTML =
          '<span class="ic">' + (ICONS[f.type] || '📄') + '</span>' +
          '<span class="info"><div class="fn">' + esc(f.file.name) + '</div>' +
          '<div class="meta">' + fmtSize(f.file.size) + (meta ? ' · 已识别为 ' + f.type : ' · 格式未知') + '</div></span>' +
          '<input type="text" value="' + esc(f.title) + '" placeholder="资源标题">' +
          '<select>' + ['video', 'image', 'document', 'table', 'link'].map(function (t) {
            return '<option value="' + t + '"' + (t === f.type ? ' selected' : '') + '>' + t + '</option>';
          }).join('') + '</select>' +
          '<span class="st"></span>' +
          '<button type="button" class="rm" title="移除">✕</button>';
        var ti = row.querySelector('input');
        var sel = row.querySelector('select');
        var stEl = row.querySelector('.st');
        ti.addEventListener('input', function () { f.title = ti.value; f.state = 'edit'; stEl.textContent = ''; });
        sel.addEventListener('change', function () { f.type = sel.value; f.state = 'edit'; stEl.textContent = ''; });
        row.querySelector('.rm').addEventListener('click', function () {
          files.splice(idx, 1); render();
        });
        if (f.state === 'run') { stEl.textContent = '⏳ 上传中…'; stEl.className = 'st run'; goBtn.disabled = true; }
        else if (f.state === 'ok') { stEl.textContent = '✓ 已发布'; stEl.className = 'st ok'; }
        else if (f.state === 'err') { stEl.textContent = '✗ ' + f.err; stEl.className = 'st err'; }
        listEl.appendChild(row);
      });
      var show = files.length > 0;
      listEl.style.display = show ? '' : 'none';
      emptyEl.style.display = show ? 'none' : '';
      footEl.style.display = show ? 'flex' : 'none';
      goBtn.disabled = false;
      updateSummary();
    }
    function updateSummary() {
      var ok = files.filter(function (f) { return f.state === 'ok'; }).length;
      var bad = files.filter(function (f) { return f.state === 'err'; }).length;
      if (!ok && !bad) { sumEl.innerHTML = '共 ' + files.length + ' 个文件'; return; }
      sumEl.innerHTML = '已完成 <span class="ok">' + ok + '</span> 成功，<span class="err">' + bad + '</span> 失败';
    }

    panel.querySelector('.mq-batch-pick').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var sel = Array.prototype.slice.call(input.files || []);
      input.value = '';
      var bad = [];
      sel.forEach(function (f) {
        var m = extType(f.name);
        if (!m) { bad.push(f.name + '（格式不支持）'); return; }
        if (f.size > MAX_SIZE) { bad.push(f.name + '（超过 550MB）'); return; }
        files.push({ file: f, title: f.name.replace(/\.[^.]+$/, ''), type: m.type, state: 'ready', err: '' });
      });
      if (bad.length) toast('已跳过 ' + bad.length + ' 个文件：' + bad.slice(0, 3).join('、'));
      render();
    });

    async function uploadOne(f) {
      f.state = 'run'; f.err = ''; render();
      try {
        var fd = new FormData();
        fd.append('file', f.file);
        var up = await api('/resources/upload', { method: 'POST', body: fd });
        var c = ctx();
        if (!c.teamId) throw new Error('请选择所属团队');
        await api('/resources', {
          method: 'POST',
          body: JSON.stringify({
            title: (f.title || f.file.name.replace(/\.[^.]+$/, '')).trim(),
            description: '',
            resource_type: f.type,
            team_id: c.teamId,
            partition_id: c.partId || null,
            visibility: c.visibility,
            file_path: up.file_path,
            file_size: up.file_size || f.file.size
          })
        });
        f.state = 'ok';
      } catch (e) {
        f.state = 'err'; f.err = (e.message || '未知错误').slice(0, 60);
      }
      render();
    }
    goBtn.addEventListener('click', function () {
      var pending = files.filter(function (f) { return f.state === 'ready' || f.state === 'err'; });
      if (!pending.length) { toast('没有待上传的文件'); return; }
      goBtn.disabled = true;
      var p = Promise.resolve();
      pending.forEach(function (f) { p = p.then(function () { return uploadOne(f); }); });
      p.then(function () {
        var ok = files.filter(function (f) { return f.state === 'ok'; }).length;
        var bad = files.filter(function (f) { return f.state === 'err'; }).length;
        toast('批量上传完成：' + ok + ' 成功' + (bad ? '，' + bad + ' 失败（可修改后再次点击上传）' : ''));
        if (ok && !bad) {
          setTimeout(function () { if (location.pathname === '/upload') location.href = '/my-resources'; }, 1600);
        }
      });
    });
    render();
  }

  /* 路由轮询：进入 /upload 且表单就绪后构建；离开时清理 */
  var lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (location.pathname === '/upload') findUploadPage();
      else if (!document.querySelector('.mq-batch')) removePanel();
    }
  }, 400);

  /* 登录态变化：退出立即移除面板；登录后若在 /upload 立即重建 */
  try {
    window.addEventListener('mq:authchange', function (e) {
      var logged = e && e.detail ? e.detail.loggedIn : !!token();
      if (!logged) removePanel();
      else if (location.pathname === '/upload') findUploadPage();
    });
  } catch (err) {}

  if (location.pathname === '/upload') findUploadPage();
})();
