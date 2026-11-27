/* ===== 明月学术 · 在线写文档入口（mingyue-doc-create.js）=====
   在 /resources、/my-resources 页右下角注入「✎ 写文档」浮标：
   选择团队/标题/可见范围后，直接进入 mingyue-doc-viewer 的双栏 Markdown 实时预览编辑器写作，
   保存时 POST 新建 document 资源并跳转到详情页。
   依赖：mingyue-doc-viewer.js（需暴露 window.mqOpenEditor）。 */
(function () {
  if (window.__mqDocCreate) return;
  window.__mqDocCreate = true;

  var SHOW_ON = ['/resources', '/my-resources'];

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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function removeFab() {
    document.querySelectorAll('.mq-fab').forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });
  }

  function buildFab() {
    if (document.querySelector('.mq-fab')) return;
    if (!token()) return;
    var b = document.createElement('button');
    b.className = 'mq-fab';
    b.type = 'button';
    b.innerHTML = '✎ 写文档';
    b.addEventListener('click', openCreate);
    document.body.appendChild(b);
  }

  function sync() {
    var show = token() && SHOW_ON.indexOf(location.pathname) >= 0;
    if (show) buildFab(); else removeFab();
  }

  function openCreate() {
    if (!token()) { toast('请先登录'); return; }
    // 改为跳转整页写作工作台（保留完整写作流程：自动保存草稿 / 插图 / 表格）
    location.href = '/editor.html';
  }

  function openCreateLegacy() {
    if (!token()) { toast('请先登录'); return; }
    var mask = document.createElement('div');
    mask.className = 'mq-createmask';
    var card = document.createElement('div');
    card.className = 'mq-createcard';
    card.innerHTML =
      '<h3>新建在线文档</h3>' +
      '<p class="mq-sub">支持 Markdown 与 LaTeX，写作时右侧实时预览。</p>' +
      '<div class="mq-field"><label>所属团队</label>' +
      '<select class="mq-c-team"><option value="">加载中…</option></select></div>' +
      '<div class="mq-field"><label>文档标题</label>' +
      '<input class="mq-c-title" type="text" maxlength="120" placeholder="例如：视觉组入门笔记" /></div>' +
      '<div class="mq-field"><label>可见范围</label>' +
      '<select class="mq-c-vis"><option value="team_only">仅团队可见</option>' +
      '<option value="public">公开</option></select></div>' +
      '<div class="mq-err"></div>' +
      '<div class="mq-create-actions">' +
      '<button type="button" class="mq-cancel">取消</button>' +
      '<button type="button" class="mq-ok">开始写作</button></div>';
    mask.appendChild(card);
    document.body.appendChild(mask);

    var sel = card.querySelector('.mq-c-team');
    var err = card.querySelector('.mq-err');
    function close() { mask.parentNode && mask.parentNode.removeChild(mask); }
    card.querySelector('.mq-cancel').addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });

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
      if (!teams.length) { sel.innerHTML = '<option value="">你还没有可发布的团队</option>'; return; }
      sel.innerHTML = '<option value="">请选择团队</option>' + teams.map(function (t) {
        return '<option value="' + t.id + '">' + esc(t.name) + '</option>';
      }).join('');
    });

    card.querySelector('.mq-ok').addEventListener('click', function () {
      var teamId = sel.value;
      var title = (card.querySelector('.mq-c-title').value || '').trim();
      var vis = card.querySelector('.mq-c-vis').value;
      if (!teamId) { err.textContent = '请选择所属团队'; return; }
      if (!title) { err.textContent = '请填写文档标题'; return; }
      err.textContent = '';
      close();
      if (!window.mqOpenEditor) { toast('编辑器未就绪，请刷新页面'); return; }
      window.mqOpenEditor(
        { title: title, heading: '新建文档' },
        '',
        function () {},
        function (md) {
          return api('/resources', {
            method: 'POST',
            body: JSON.stringify({
              title: title,
              description: '',
              content: md,
              resource_type: 'document',
              team_id: Number(teamId),
              visibility: vis,
              file_path: null,
              file_size: 0
            })
          }).then(function (d) {
            toast('文档已创建');
            setTimeout(function () { location.href = '/resources/' + d.id; }, 700);
            return d;
          });
        }
      );
    });
  }

  // 路由轮询 + 登录态变化响应
  var lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) { lastPath = location.pathname; sync(); }
  }, 500);
  try {
    window.addEventListener('mq:authchange', sync);
  } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
