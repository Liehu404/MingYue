/* 明月学术 · 数据管理前端 v1.0 (2026-11) — 原生 JS，无构建 */
(function () {
  'use strict';

  const API = '/academic/api/v1';
  const S = {
    token: '', user: null, bases: [], kb: null,
    tab: 'docs', docs: [], conflicts: [], sources: [], jobs: [],
    detail: null, uploadDocId: null, pollTimer: null, searchTimer: null,
  };

  /* ------------------------------------------------ 基础工具 */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
    if (isNaN(d)) return iso;
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 320); }, 3200);
  }
  function debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); }; }

  async function api(path, opts) {
    opts = opts || {};
    const headers = opts.headers || {};
    if (S.token) headers['Authorization'] = 'Bearer ' + S.token;
    let body = opts.body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const res = await fetch(API + path, { method: opts.method || 'GET', headers, body });
    if (res.status === 401) { showLogin(); throw new Error('未登录'); }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const msg = (data && (data.detail || data.message)) || ('请求失败 ' + res.status);
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  }

  /* ------------------------------------------------ 登录 */
  function showLogin() { $('#loginMask').classList.add('show'); }
  function hideLogin() { $('#loginMask').classList.remove('show'); }

  async function doLogin() {
    const username = $('#lgUser').value.trim();
    const password = $('#lgPass').value;
    if (!username || !password) { $('#loginErr').textContent = '请输入用户名和密码'; return; }
    $('#loginErr').textContent = '';
    $('#btnLogin').disabled = true;
    try {
      const res = await fetch(API + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '登录失败');
      localStorage.setItem('token', data.access_token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      sessionStorage.removeItem('mq_sso_disabled');
      S.token = data.access_token;
      location.reload();
    } catch (e) {
      $('#loginErr').textContent = e.message;
    } finally { $('#btnLogin').disabled = false; }
  }

  async function trySSO() {
    try {
      if (sessionStorage.getItem('mq_sso_disabled')) return false;
      const res = await fetch(API + '/auth/sso', { method: 'POST' });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.access_token) return false;
      localStorage.setItem('token', data.access_token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      sessionStorage.removeItem('mq_sso_disabled');
      S.token = data.access_token;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function boot() {
    S.token = localStorage.getItem('token') || '';
    if (!S.token) {
      if (!(await trySSO())) { showLogin(); return; }
    }
    try {
      const me = await api('/auth/me');
      S.user = me.user || me;
      if (S.user && S.user.display_name) {
        $('#userName').textContent = S.user.display_name;
        $('#avatar').textContent = S.user.display_name.slice(0, 1);
      }
      const roleMap = {
        super_admin: '超级管理员', advisor_teacher: '指导老师', team_captain: '队长',
        team_pm: '产品经理', tech_lead: '技术负责人', student: '学生',
      };
      $('#userRole').textContent = roleMap[(S.user && S.user.role) || ''] || '';
      hideLogin();
      await loadBases();
      if (S.bases.length) selectKb(S.bases[0].id, true);
      else renderEmptyAll();
    } catch (e) {
      localStorage.removeItem('token');
      if (await trySSO()) { location.reload(); return; }
      showLogin();
    }
  }

  /* ------------------------------------------------ 知识库 */
  async function loadBases() {
    S.bases = await api('/kb/bases');
    renderBases();
  }

  function renderBases() {
    const box = $('#kbList');
    if (!S.bases.length) {
      box.innerHTML = '<div class="empty" style="padding:24px 10px"><div class="t">还没有知识库</div><div class="d">点右上角「新建」开始</div></div>';
      return;
    }
    const groups = [
      ['课程知识库', S.bases.filter(b => b.kind === 'course')],
      ['共享知识库', S.bases.filter(b => b.kind === 'shared')],
      ['个人知识库', S.bases.filter(b => b.kind === 'personal')],
    ];
    box.innerHTML = groups.map(([title, list]) => {
      if (!list.length) return '';
      return `<div class="kb-group-title">${title}</div>` + list.map(b => `
        <div class="kb-item ${S.kb && S.kb.id === b.id ? 'active' : ''}" data-kb="${b.id}">
          <span class="dot"></span>
          <div class="body">
            <div class="nm">${esc(b.name)}</div>
            <div class="sub">${b.kind === 'course'
              ? `${b.class_count || 0} 班 · ${b.knowledge_count || 0} 知识点`
              : b.kind === 'shared' ? '课程级共享' : esc(b.code || b.term || '—')}</div>
          </div>
          <span class="cnt">${b.doc_count || 0}</span>
        </div>`).join('');
    }).join('');
    $$('.kb-item', box).forEach(el => el.onclick = () => selectKb(Number(el.dataset.kb)));
  }

  async function selectKb(id, silent) {
    const kb = S.bases.find(b => b.id === id);
    if (!kb) return;
    S.kb = kb;
    renderBases();
    if (!silent) { S.tab = 'docs'; syncTabs(); }
    await Promise.all([loadStats(), loadTab()]);
  }

  function renderEmptyAll() {
    $('#view-docs').innerHTML = `<div class="panel"><div class="empty"><div class="ico">◍</div><div class="t">先创建一个知识库</div><div class="d">课程知识库用于检索，个人知识库需勾选后才并入</div></div></div>`;
  }

  async function loadStats() {
    try {
      const st = await api('/kb/stats' + (S.kb ? '?kb_id=' + S.kb.id : ''));
      $('#stDocs').textContent = st.documents;
      $('#stVers').textContent = st.versions;
      $('#stSize').textContent = fmtSize(st.storage_bytes);
      $('#stConf').textContent = st.open_conflicts;
      const cb = $('#tabConfCount'); if (cb) cb.textContent = st.open_conflicts;
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------ tabs */
  function syncTabs() {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === S.tab));
    ['docs', 'conflicts', 'sources', 'jobs'].forEach(k => {
      $('#view-' + k).style.display = k === S.tab ? '' : 'none';
    });
  }

  async function loadTab() {
    if (!S.kb) return;
    if (S.tab === 'docs') await loadDocs();
    else if (S.tab === 'conflicts') await loadConflicts();
    else if (S.tab === 'sources') await loadSources();
    else if (S.tab === 'jobs') await loadJobs();
  }

  /* ------------------------------------------------ 文档列表 */
  async function loadDocs() {
    const box = $('#view-docs');
    box.innerHTML = '<div class="panel skeleton"><i></i><i></i><i style="width:70%"></i></div>';
    try {
      S.docs = await api(`/kb/bases/${S.kb.id}/documents`);
    } catch (e) { toast(e.message, 'err'); S.docs = []; }
    S.kps = [];
    if (S.kb.kind === 'course') {
      try { S.kps = await api(`/kb/knowledge-points?kb_id=${S.kb.id}&limit=2000`); } catch (e) { S.kps = []; }
    }
    $('#tabDocCount').textContent = S.docs.length;
    renderDocs();
  }

  function sourceLabel(s) {
    return ({ upload: '上传', canvas: 'Canvas', api: '接口', local: '本地目录', manual: '手动' })[s] || s;
  }
  function statePill(v) {
    if (!v) return '<span class="pill gray">无有效版本</span>';
    const map = { active: ['green', '有效'], superseded: ['gray', '已停用'], pending: ['orange', '处理中'], archived: ['gray', '已归档'] };
    const [cls, label] = map[v.state] || ['gray', v.state];
    return `<span class="pill ${cls}">v${v.version_no} · ${label}</span>`;
  }

  function courseMeta() {
    if (!S.kb || S.kb.kind !== 'course') return '';
    const kps = S.kps || [];
    const chips = kps.slice(0, 40).map(k => `<span class="kp-chip">${esc(k.name)}</span>`).join('');
    const codes = (S.kb.code || '').split(',').filter(Boolean).slice(0, 3).join(' · ');
    return `<div class="course-meta">
      <div class="cm-item"><b>${S.kb.class_count || 0}</b><span>教学班</span></div>
      <div class="cm-item"><b>${kps.length}</b><span>知识点</span></div>
      <div class="cm-item"><b>${S.docs.length}</b><span>文档</span></div>
      <div class="cm-code">${esc(codes || 'Canvas 同步')}</div>
    </div>
    ${chips ? `<div class="kp-cloud">${chips}${kps.length > 40 ? `<span class="kp-more">+${kps.length - 40}</span>` : ''}</div>` : ''}`;
  }

  function renderDocs() {
    const box = $('#view-docs');
    if (!S.docs.length) {
      box.innerHTML = `<div class="panel">
        <div class="panel-head"><h3>${esc(S.kb.name)}</h3><span class="spacer"></span>
          <button class="btn sm danger" id="btnDelKb">删除库</button>
          <button class="btn sm primary" id="btnUploadTop">＋ 上传文档</button></div>
        ${courseMeta()}
        <div class="empty"><div class="ico">⇪</div><div class="t">这个知识库还没有文档</div>
        <div class="d">上传 PDF / Word / PPT / 视频，系统会自动解析、比对版本并登记冲突</div>
        <div style="margin-top:14px"><button class="btn primary" id="btnUploadEmpty">上传第一个文档</button></div></div></div>`;
      $('#btnUploadTop').onclick = () => openUpload(null);
      $('#btnUploadEmpty').onclick = () => openUpload(null);
      $('#btnDelKb').onclick = deleteKb;
      return;
    }
    box.innerHTML = `<div class="panel">
      <div class="panel-head"><h3>${esc(S.kb.name)}</h3>
        <span class="pill gray">${esc(S.kb.kind === 'course' ? '课程库' : '个人库')}</span>
        <span class="spacer"></span>
        <button class="btn sm danger" id="btnDelKb">删除库</button>
        <button class="btn sm" id="btnRefresh">刷新</button>
        <button class="btn sm primary" id="btnUploadTop">＋ 上传文档</button>
      </div>
      ${courseMeta()}
      <div class="table-wrap"><table class="kb-table">        <thead><tr><th>文档</th><th>知识点</th><th>当前版本</th><th>版本数</th><th>来源</th><th>更新时间</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>${S.docs.map(d => `
          <tr>
            <td><div class="doc-title" data-doc="${d.id}">${esc(d.title)}</div><div class="doc-sub">${esc(d.doc_type.toUpperCase())}</div></td>
            <td>${d.topic ? `<span class="pill gray">${esc(d.topic)}</span>` : '<span style="color:var(--ink-3)">—</span>'}</td>
            <td>${statePill(d.active_version)}</td>
            <td>${d.version_count || 0}</td>
            <td><span class="pill blue">${esc(sourceLabel(d.source))}</span></td>
            <td style="color:var(--ink-3);font-size:12px">${fmtTime(d.updated_at)}</td>
            <td><div class="actions">
              <button class="btn sm" data-detail="${d.id}">版本</button>
              <button class="btn sm" data-ver="${d.id}">新版本</button>
              ${d.active_version && d.active_version.download_url ? `<a class="btn sm" href="${esc(d.active_version.download_url)}" target="_blank">下载</a>` : ''}
            </div></td>
          </tr>`).join('')}
        </tbody></table></div></div>`;

    $('#btnRefresh').onclick = () => { loadDocs(); loadStats(); };
    $('#btnDelKb').onclick = deleteKb;
    $('#btnUploadTop').onclick = () => openUpload(null);
    $$('[data-doc]', box).forEach(el => el.onclick = () => openDetail(Number(el.dataset.doc)));
    $$('[data-detail]', box).forEach(el => el.onclick = () => openDetail(Number(el.dataset.detail)));
    $$('[data-ver]', box).forEach(el => el.onclick = () => openUpload(Number(el.dataset.ver)));
  }

  async function deleteKb() {
    if (!S.kb) return;
    if (!confirm(`删除知识库「${S.kb.name}」？\n其中的文档记录会一并移除，已上传的文件保留在服务器。`)) return;
    try {
      await api('/kb/bases/' + S.kb.id, { method: 'DELETE' });
      toast('知识库已删除', 'ok');
      S.kb = null;
      await loadBases();
      if (S.bases.length) selectKb(S.bases[0].id, true); else { S.docs = []; renderEmptyAll(); }
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ------------------------------------------------ 上传 */
  function openUpload(docId) {
    if (!S.kb) return;
    S.uploadDocId = docId;
    const doc = docId ? S.docs.find(d => d.id === docId) : null;
    $('#upTitle').textContent = doc ? `上传新版本 · ${doc.title}` : '上传到知识库';
    $('#upName').value = doc ? doc.title : '';
    $('#upTopic').value = doc ? (doc.topic || '') : '';
    $('#upNote').value = '';
    $('#upAuto').checked = !doc;
    $('#upName').disabled = !!doc;
    $('#upTopic').disabled = !!doc;
    $('#fileInput').value = '';
    $('#fileChip').innerHTML = '';
    $('#dropzone').classList.remove('has-file');
    showModal('#uploadModal');
  }

  function selectedFile() { return $('#fileInput').files[0] || null; }

  async function submitUpload() {
    const f = selectedFile();
    if (!f) { toast('请先选择文件', 'err'); return; }
    const btn = $('#btnSubmitUpload');
    btn.disabled = true; btn.textContent = '上传中…';
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('note', $('#upNote').value);
      fd.append('auto_activate', $('#upAuto').checked ? 'true' : 'false');
      let res;
      if (S.uploadDocId) {
        res = await api(`/kb/documents/${S.uploadDocId}/versions`, { method: 'POST', body: fd });
      } else {
        fd.append('title', $('#upName').value || f.name.replace(/\.[^.]+$/, ''));
        fd.append('topic', $('#upTopic').value);
        res = await api(`/kb/bases/${S.kb.id}/documents`, { method: 'POST', body: fd });
      }
      closeModals();
      toast('已进入处理流水线，正在解析…', 'ok');
      await loadDocs(); await loadStats();
      pollUntilDone(res.job_id);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = '开始上传';
    }
  }

  function pollUntilDone(jobId) {
    let n = 0;
    const tick = async () => {
      n++;
      try {
        const jobs = await api('/kb/jobs' + (S.kb ? '?kb_id=' + S.kb.id : ''));
        const job = jobs.find(j => j.id === jobId);
        if (job && (job.status === 'done' || job.status === 'failed')) {
          if (job.status === 'done') {
            toast('解析完成' + (job.message ? '：' + job.message : ''), 'ok');
          } else {
            toast('解析失败：' + job.message, 'err');
          }
          await loadDocs(); await loadStats();
          if (S.tab === 'conflicts') await loadConflicts();
          return;
        }
      } catch (e) { /* ignore */ }
      if (n < 40) setTimeout(tick, 1500);
    };
    setTimeout(tick, 1200);
  }

  /* ------------------------------------------------ 文档详情 */
  async function openDetail(docId) {
    try {
      const d = await api('/kb/documents/' + docId);
      S.detail = d;
      $('#dTitle').textContent = d.title;
      $('#dSub').textContent = `${d.kb_name} · ${d.topic || '未标注知识点'} · ${d.doc_type.toUpperCase()} · ${d.version_count} 个版本`;
      $('#dBody').innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
          <button class="btn primary" id="dUpload">＋ 上传新版本</button>
          <button class="btn" id="dRefresh">刷新</button>
          ${d.active_version && d.active_version.download_url ? `<a class="btn" href="${esc(d.active_version.download_url)}" target="_blank">下载当前版本</a>` : ''}
        </div>
        <div class="panel-head" style="padding:0 0 12px;border-bottom:1px solid var(--divider)"><h3>版本历史</h3>
          <span class="spacer"></span><span class="pill gray">检索只取「有效」版本</span></div>
        <div class="timeline" style="margin-top:16px">
          ${(d.versions || []).map(v => `
            <div class="tl-item ${v.state === 'active' ? 'active' : ''}">
              <div class="tl-head">
                <span class="v">v${v.version_no}</span>
                ${statePill(v)}
                <span class="spacer"></span>
                <span style="font-size:11px;color:var(--ink-3)">${fmtTime(v.created_at)}</span>
              </div>
              <div class="tl-meta">${esc(v.filename || '')} · ${fmtSize(v.file_size)} · ${v.text_length || 0} 字
                ${v.meta && v.meta.pages ? ' · ' + v.meta.pages + ' 页' : ''}
                ${v.meta && v.meta.slides ? ' · ' + v.meta.slides + ' 页' : ''}
                ${v.meta && v.meta.duration ? ' · ' + Math.round(v.meta.duration) + ' 秒' : ''}
              </div>
              ${v.note ? `<div class="tl-note">📝 ${esc(v.note)}</div>` : ''}
              <div class="tl-actions">
                ${v.state !== 'active' ? `<button class="btn sm primary" data-act="${v.id}" data-state="active">设为有效版本</button>` : ''}
                ${v.state !== 'active' && v.state !== 'archived' ? `<button class="btn sm" data-act="${v.id}" data-state="archive">停用</button>` : ''}
                ${v.download_url ? `<a class="btn sm" href="${esc(v.download_url)}" target="_blank">下载</a>` : ''}
                <button class="btn sm ghost" data-preview="${v.id}">预览正文</button>
              </div>
              <pre class="preview" id="pv-${v.id}" style="display:none">${esc(v.preview || '（未抽取到文本）')}</pre>
            </div>`).join('')}
        </div>`;
      $('#dUpload').onclick = () => { closeDrawer(); openUpload(d.id); };
      $('#dRefresh').onclick = () => openDetail(docId);
      $$('[data-act]', $('#dBody')).forEach(btn => btn.onclick = () => versionAction(Number(btn.dataset.act), btn.dataset.state, docId));
      $$('[data-preview]', $('#dBody')).forEach(btn => btn.onclick = () => {
        const el = $('#pv-' + btn.dataset.preview);
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      });
      $('#drawer').classList.add('show');
    } catch (e) { toast(e.message, 'err'); }
  }

  async function versionAction(versionId, action, docId) {
    if (action === 'archive' && !confirm('停用这个版本？文件会保留，可随时重新启用。')) return;
    try {
      if (action === 'active') {
        const r = await api(`/kb/versions/${versionId}/activate`, { method: 'POST' });
        toast(`已启用，旧版本自动停用${r.closed_conflicts ? '，并结案 ' + r.closed_conflicts + ' 条冲突' : ''}`, 'ok');
      } else {
        await api(`/kb/versions/${versionId}/archive`, { method: 'POST' });
        toast('已停用该版本', 'ok');
      }
      await loadDocs(); await loadStats(); await openDetail(docId);
      if (S.tab === 'conflicts') await loadConflicts();
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ------------------------------------------------ 冲突 */
  const kindLabel = { content_diff: '内容差异', duplicate: '重复文件', title_clash: '同名文档', version_clash: '版本冲突' };
  const sevLabel = { high: ['red', '高'], medium: ['orange', '中'], low: ['blue', '低'], none: ['gray', '无'] };

  async function loadConflicts() {
    const box = $('#view-conflicts');
    box.innerHTML = '<div class="panel skeleton"><i></i><i></i></div>';
    try {
      S.conflicts = await api(`/kb/conflicts?kb_id=${S.kb.id}&status=open`);
    } catch (e) { toast(e.message, 'err'); S.conflicts = []; }
    renderConflicts();
  }

  function renderConflicts() {
    const box = $('#view-conflicts');
    const head = `<div class="panel-head"><h3>冲突处理</h3>
      <span class="pill ${S.conflicts.length ? 'orange' : 'green'}">${S.conflicts.length} 条待处理</span>
      <span class="spacer"></span>
      <button class="btn sm" id="btnScanConf">扫描同知识点差异</button>
      <button class="btn sm" id="btnConfRefresh">刷新</button></div>`;
    if (!S.conflicts.length) {
      box.innerHTML = `<div class="panel">${head}<div class="empty"><div class="ico">✓</div>
        <div class="t">没有待处理的冲突</div><div class="d">新版本与当前有效版本存在内容差异时，会自动登记到这里</div></div></div>`;
      $('#btnConfRefresh').onclick = loadConflicts;
      $('#btnScanConf').onclick = scanConflicts;
      return;
    }
    box.innerHTML = `<div class="panel">${head}<div class="cards">
      ${S.conflicts.map(c => {
        const [sc, sl] = sevLabel[c.severity] || ['gray', c.severity];
        const sample = (c.detail && c.detail.sample) || '';
        const sampleHtml = sample.split('\n').map(line => {
          if (line.startsWith('+ ')) return `<span class="add">${esc(line)}</span>`;
          if (line.startsWith('- ')) return `<span class="del">${esc(line)}</span>`;
          return esc(line);
        }).join('');
        return `<div class="card-row">
          <div class="row1">
            <span class="pill ${sc}">${sl}</span>
            <span class="pill gray">${kindLabel[c.kind] || c.kind}</span>
            <span class="title">${esc((S.docs.find(d => d.id === c.document_id) || {}).title || ("文档 #" + c.document_id))}</span>
            <span class="spacer"></span>
            <span style="font-size:11px;color:var(--ink-3)">${fmtTime(c.created_at)}</span>
          </div>
          <div class="desc">${esc(c.summary || '')}</div>
          ${sampleHtml ? `<div class="diff">${sampleHtml}</div>` : ''}
          <div class="actions" style="margin-top:10px;justify-content:flex-start">
            ${c.new_version_id ? `<button class="btn sm primary" data-res="${c.id}" data-act="keep_new">采用新版本</button>` : ''}
            <button class="btn sm" data-res="${c.id}" data-act="keep_old">保留旧版本</button>
            <button class="btn sm ghost" data-res="${c.id}" data-act="ignored">忽略</button>
            <button class="btn sm ghost" data-docjump="${c.document_id}">查看文档</button>
          </div>
        </div>`;
      }).join('')}
    </div></div>`;
    $('#btnConfRefresh').onclick = loadConflicts;
    $('#btnScanConf').onclick = scanConflicts;
    $$('[data-res]', box).forEach(b => b.onclick = () => resolveConflict(Number(b.dataset.res), b.dataset.act));
    $$('[data-docjump]', box).forEach(b => b.onclick = () => openDetail(Number(b.dataset.docjump)));
  }

  async function scanConflicts(ev) {
    const btn = ev.currentTarget;
    btn.disabled = true; btn.textContent = '扫描中…';
    try {
      const r = await api(`/kb/bases/${S.kb.id}/scan-conflicts`, { method: 'POST' });
      toast(r.created ? `发现 ${r.created} 条同知识点资料差异` : '没有发现新的差异', r.created ? 'ok' : '');
      await loadConflicts(); await loadStats();
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = '扫描同知识点差异'; }
  }

  async function resolveConflict(id, action) {
    try {
      await api(`/kb/conflicts/${id}/resolve`, { method: 'POST', body: { action } });
      toast(action === 'keep_new' ? '已采用新版本，旧版本停用' : '已处理', 'ok');
      await loadConflicts(); await loadStats(); await loadDocs();
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ------------------------------------------------ 数据源 */
  const srcTypeLabel = { canvas: 'Canvas', http_json: 'HTTP JSON', local_dir: '本地目录', fastgpt: 'FastGPT 数据集' };

  async function loadSources() {
    const box = $('#view-sources');
    box.innerHTML = '<div class="panel skeleton"><i></i></div>';
    try { S.sources = await api(`/kb/bases/${S.kb.id}/sources`); }
    catch (e) { toast(e.message, 'err'); S.sources = []; }
    renderSources();
  }

  function srcConfigSummary(s) {
    const c = s.config || {};
    if (s.type === 'canvas') return `${c.base_url || ''} · 课程 ${c.course_id || '?'}`;
    if (s.type === 'http_json') return c.url || '';
    if (s.type === 'local_dir') return c.path || '';
    return '';
  }

  function renderSources() {
    const box = $('#view-sources');
    const head = `<div class="panel-head"><h3>数据源接入</h3><span class="spacer"></span>
      <button class="btn sm" id="btnSyncCanvas">⟳ 从 Canvas 同步</button>
      <button class="btn sm" id="btnSrcRefresh">刷新</button>
      <button class="btn sm primary" id="btnAddSrc">＋ 添加数据源</button></div>`;
    if (!S.sources.length) {
      box.innerHTML = `<div class="panel">${head}<div class="empty"><div class="ico">⇄</div>
        <div class="t">尚未接入外部数据源</div>
        <div class="d">支持 Canvas 课程文件、通用 HTTP JSON 接口、服务器本地目录</div></div></div>`;
    } else {
      box.innerHTML = `<div class="panel">${head}<div class="cards">
        ${S.sources.map(s => `<div class="card-row">
          <div class="row1">
            <span class="pill blue">${esc(srcTypeLabel[s.type] || s.type)}</span>
            <span class="title">${esc(s.name)}</span>
            <span class="pill ${s.enabled ? 'green' : 'gray'}">${s.enabled ? '已启用' : '已停用'}</span>
            <span class="spacer"></span>
            <span style="font-size:11px;color:var(--ink-3)">上次同步：${fmtTime(s.last_sync_at)}</span>
          </div>
          <div class="desc" style="font-family:var(--font-mono);font-size:11.5px">${esc(srcConfigSummary(s))}</div>
          ${s.last_message ? `<div class="desc" style="color:var(--ink-3)">${esc(s.last_message)}</div>` : ''}
          <div class="actions" style="margin-top:10px;justify-content:flex-start">
            <button class="btn sm primary" data-sync="${s.id}">立即同步</button>
            <button class="btn sm" data-toggle="${s.id}" data-on="${s.enabled ? 1 : 0}">${s.enabled ? '停用' : '启用'}</button>
            <button class="btn sm danger" data-del="${s.id}">删除</button>
          </div>
        </div>`).join('')}
      </div></div>`;
    }
    $('#btnAddSrc').onclick = openSourceModal;
    $('#btnSrcRefresh').onclick = loadSources;
    const bc = $('#btnSyncCanvas');
    if (bc) bc.onclick = async () => {
      bc.disabled = true; bc.textContent = '同步中…';
      try {
        const r = await api('/kb/sync/canvas', { method: 'POST' });
        toast(`Canvas 同步完成：${r.courses} 门课 · ${r.classes} 个班 · ${r.knowledge_points} 条知识点 · ${r.docs} 个文档`, 'ok');
        await loadBases(); await loadDocs(); await loadStats();
      } catch (e) { toast(e.message, 'err'); }
      finally { bc.disabled = false; bc.textContent = '⟳ 从 Canvas 同步'; }
    };
    $$('[data-sync]', box).forEach(b => b.onclick = () => syncSource(Number(b.dataset.sync), b));
    $$('[data-toggle]', box).forEach(b => b.onclick = async () => {
      try {
        await api('/kb/sources/' + b.dataset.toggle, { method: 'PATCH', body: { enabled: b.dataset.on !== '1' } });
        await loadSources();
      } catch (e) { toast(e.message, 'err'); }
    });
    $$('[data-del]', box).forEach(b => b.onclick = async () => {
      if (!confirm('删除这个数据源？已同步的文档不会删除。')) return;
      try { await api('/kb/sources/' + b.dataset.del, { method: 'DELETE' }); await loadSources(); toast('已删除', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    });
  }

  async function syncSource(id, btn) {
    btn.disabled = true; btn.textContent = '同步中…';
    try {
      const r = await api(`/kb/sources/${id}/sync`, { method: 'POST' });
      toast(`同步完成：新增 ${r.created}，跳过 ${r.skipped}${r.errors && r.errors.length ? '，失败 ' + r.errors.length : ''}`, r.errors && r.errors.length ? 'err' : 'ok');
      await loadSources(); await loadDocs(); await loadStats();
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = '立即同步'; }
  }

  function openSourceModal() {
    $('#srcName').value = '';
    $('#srcType').value = 'canvas';
    $('#srcAuto').checked = false;
    renderSrcFields();
    showModal('#srcModal');
  }

  function renderSrcFields() {
    const type = $('#srcType').value;
    const box = $('#srcFields');
    if (type === 'canvas') {
      box.innerHTML = `
        <div class="field"><label>Canvas 地址</label><input type="url" id="cfgBase" placeholder="https://canvas.example.edu" /></div>
        <div class="row2">
          <div class="field"><label>课程 ID</label><input type="text" id="cfgCourse" placeholder="12345" /></div>
          <div class="field"><label>访问令牌</label><input type="password" id="cfgToken" placeholder="Canvas API Token" /></div>
        </div>
        <div class="field"><div class="hint">将调用 /academic/api/v1/courses/&lt;id&gt;/files 拉取课程文件，按文件 ID 去重。</div></div>`;
    } else if (type === 'http_json') {
      box.innerHTML = `
        <div class="field"><label>接口地址</label><input type="url" id="cfgUrl" placeholder="https://example.com/api/files" /></div>
        <div class="row2">
          <div class="field"><label>Bearer Token（可选）</label><input type="password" id="cfgToken" /></div>
          <div class="field"><label>列表字段名</label><input type="text" id="cfgItems" placeholder="items" /></div>
        </div>
        <div class="field"><div class="hint">接口返回数组，或 { "items": [ { "title", "url", "id" } ] }。</div></div>`;
    } else if (type === 'fastgpt') {
      box.innerHTML = `
        <div class="field"><label>Dataset ID</label><input type="text" id="cfgDataset" placeholder="69c0cbbc799878a22bccad22" /></div>
        <div class="field"><label>Dataset 名称（可选）</label><input type="text" id="cfgDatasetName" placeholder="共享知识库" /></div>
        <div class="field"><div class="hint">按 FastGPT 的 collection 逐个导入为文档，需校园网隧道在线。</div></div>`;
    } else {
      box.innerHTML = `
        <div class="field"><label>服务器目录</label><input type="text" id="cfgPath" placeholder="/data/courseware/CS401" /></div>
        <div class="field"><div class="hint">扫描目录下的文件（不递归），按完整路径去重。</div></div>`;
    }
  }

  async function createSource() {
    const type = $('#srcType').value;
    const cfg = {};
    if (type === 'canvas') {
      cfg.base_url = $('#cfgBase').value.trim();
      cfg.course_id = $('#cfgCourse').value.trim();
      cfg.token = $('#cfgToken').value.trim();
      if (!cfg.base_url || !cfg.course_id) { toast('请填写 Canvas 地址和课程 ID', 'err'); return; }
    } else if (type === 'http_json') {
      cfg.url = $('#cfgUrl').value.trim();
      cfg.token = $('#cfgToken').value.trim();
      cfg.items_key = $('#cfgItems').value.trim() || 'items';
      if (!cfg.url) { toast('请填写接口地址', 'err'); return; }
    } else if (type === 'fastgpt') {
      cfg.dataset_id = $('#cfgDataset').value.trim();
      cfg.name = $('#cfgDatasetName').value.trim();
      if (!cfg.dataset_id) { toast('请填写 Dataset ID', 'err'); return; }
    } else {
      cfg.path = $('#cfgPath').value.trim();
      if (!cfg.path) { toast('请填写目录路径', 'err'); return; }
    }
    try {
      await api(`/kb/bases/${S.kb.id}/sources`, {
        method: 'POST',
        body: { name: $('#srcName').value.trim() || srcTypeLabel[type], type, config: cfg, auto_sync: $('#srcAuto').checked },
      });
      closeModals(); toast('数据源已添加', 'ok'); await loadSources();
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ------------------------------------------------ 流水线 */
  const jobState = { queued: ['gray', '排队'], running: ['orange', '处理中'], done: ['green', '完成'], failed: ['red', '失败'] };
  const stageLabel = { queued: '排队', extracting: '解析中', diffing: '比对中', done: '完成', failed: '失败' };

  async function loadJobs() {
    const box = $('#view-jobs');
    try { S.jobs = await api('/kb/jobs' + (S.kb ? '?kb_id=' + S.kb.id + '&limit=40' : '?limit=40')); }
    catch (e) { toast(e.message, 'err'); S.jobs = []; }
    renderJobs();
  }

  function renderJobs() {
    const box = $('#view-jobs');
    const head = `<div class="panel-head"><h3>处理流水线</h3>
      <span class="pill gray">上传 → 解析 → 比对 → 入库</span>
      <span class="spacer"></span><button class="btn sm" id="btnJobRefresh">刷新</button></div>`;
    if (!S.jobs.length) {
      box.innerHTML = `<div class="panel">${head}<div class="empty"><div class="ico">⋯</div><div class="t">暂无处理记录</div></div></div>`;
    } else {
      box.innerHTML = `<div class="panel">${head}<div class="cards">
        ${S.jobs.map(j => {
          const [c, l] = jobState[j.status] || ['gray', j.status];
          return `<div class="card-row">
            <div class="row1">
              <span class="pill ${c}">${l}</span>
              <span class="title">${esc(j.filename || '任务 #' + j.id)}</span>
              <span class="pill gray">${esc(stageLabel[j.stage] || j.stage || '')}</span>
              <span class="spacer"></span>
              <span style="font-size:11px;color:var(--ink-3)">${fmtTime(j.created_at)}</span>
            </div>
            <div class="progress"><i style="width:${Math.min(100, j.progress || 0)}%"></i></div>
            <div class="desc" style="margin-top:6px;color:var(--ink-3)">${esc(j.message || '')}</div>
          </div>`;
        }).join('')}
      </div></div>`;
    }
    $('#btnJobRefresh').onclick = loadJobs;

    const active = S.jobs.some(j => j.status === 'queued' || j.status === 'running');
    clearTimeout(S.pollTimer);
    if (S.tab === 'jobs') {
      S.pollTimer = setTimeout(() => { if (S.tab === 'jobs') loadJobs(); }, active ? 2000 : 15000);
    }
  }

  /* ------------------------------------------------ 检索 */
  async function doSearch() {
    const q = $('#q').value.trim();
    const box = $('#searchResults');
    if (!q) { box.classList.remove('show'); return; }
    const inc = $('#incPersonal').checked;
    $('#srCount').textContent = '检索中…';
    try {
      const scope = (S.kb && S.kb.kind === 'course') ? `&kb_ids=${S.kb.id}` : '';
      const r = await api(`/kb/search?q=${encodeURIComponent(q)}&include_personal=${inc}${scope}&limit=20`);
      $('#srCount').textContent = `命中 ${r.total} 条（仅当前有效版本${scope ? ' · ' + S.kb.name : ''}）`;
      const list = $('#srList');
      if (!r.items.length) {
        list.innerHTML = '<div class="sr-empty">没有找到匹配内容</div>';
      } else {
        list.innerHTML = r.items.map((it, i) => {
          const snippet = esc(it.snippet).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`);
          return `<div class="sr-item" data-i="${i}">
            <div class="t">${esc(it.title)}</div>
            <div class="m">${esc(it.kb_name)} · ${it.kb_kind === 'personal' ? '个人库' : '课程库'} · v${it.version_no}${it.topic ? ' · ' + esc(it.topic) : ''}</div>
            <div class="s">${snippet}</div>
          </div>`;
        }).join('');
        $$('.sr-item', list).forEach(el => el.onclick = () => {
          const it = r.items[Number(el.dataset.i)];
          box.classList.remove('show');
          if (!S.kb || S.kb.id !== it.kb_id) {
            const kb = S.bases.find(b => b.id === it.kb_id);
            if (kb) { S.kb = kb; renderBases(); loadStats(); }
          }
          S.tab = 'docs'; syncTabs();
          openDetail(it.document_id);
        });
      }
      box.classList.add('show');
    } catch (e) {
      $('#srCount').textContent = '检索失败：' + e.message;
    }
  }

  /* ------------------------------------------------ 弹窗控制 */
  function showModal(sel) { $('#overlay').classList.add('show'); $(sel).classList.add('show'); }
  function closeModals() {
    $('#overlay').classList.remove('show');
    $$('.modal').forEach(m => m.classList.remove('show'));
  }
  function closeDrawer() { $('#drawer').classList.remove('show'); }

  /* ------------------------------------------------ 事件绑定 */
  function bind() {
    $('#btnLogin').onclick = doLogin;
    $('#lgPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    $('#lgUser').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lgPass').focus(); });

    $('#btnLogout').onclick = () => {
      // 明确退出：清学术态并回到主站首页，不再自动 SSO 回来
      sessionStorage.setItem('mq_sso_disabled', '1');
      localStorage.removeItem('token'); localStorage.removeItem('user');
      location.href = '/';
    };

    $('#tabs').addEventListener('click', e => {
      const t = e.target.closest('.tab');
      if (!t) return;
      S.tab = t.dataset.tab;
      syncTabs();
      loadTab();
    });

    $('#btnNewKb').onclick = () => {
      $('#kbName').value = ''; $('#kbCode').value = ''; $('#kbTerm').value = ''; $('#kbDesc').value = '';
      $('#kbKind').value = 'course';
      showModal('#kbModal');
    };
    $('#btnCreateKb').onclick = async () => {
      const name = $('#kbName').value.trim();
      if (!name) { toast('请填写名称', 'err'); return; }
      try {
        const kb = await api('/kb/bases', {
          method: 'POST',
          body: { name, kind: $('#kbKind').value, code: $('#kbCode').value, term: $('#kbTerm').value, description: $('#kbDesc').value },
        });
        closeModals(); toast('知识库已创建', 'ok');
        await loadBases(); selectKb(kb.id, true);
      } catch (e) { toast(e.message, 'err'); }
    };

    $('#btnSubmitUpload').onclick = submitUpload;
    $('#dropzone').onclick = () => $('#fileInput').click();
    $('#fileInput').onchange = () => {
      const f = selectedFile();
      if (!f) return;
      $('#fileChip').innerHTML = `<span class="file-chip">📄 ${esc(f.name)} · ${fmtSize(f.size)}</span>`;
      $('#dropzone').classList.add('has-file');
      if (!$('#upName').value) $('#upName').value = f.name.replace(/\.[^.]+$/, '');
    };
    ['dragenter', 'dragover'].forEach(ev => $('#dropzone').addEventListener(ev, e => {
      e.preventDefault(); $('#dropzone').classList.add('drag');
    }));
    ['dragleave', 'drop'].forEach(ev => $('#dropzone').addEventListener(ev, e => {
      e.preventDefault(); $('#dropzone').classList.remove('drag');
    }));
    $('#dropzone').addEventListener('drop', e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        const dt = new DataTransfer(); dt.items.add(f);
        $('#fileInput').files = dt.files;
        $('#fileInput').onchange();
      }
    });

    $('#srcType').onchange = renderSrcFields;
    $('#btnCreateSrc').onclick = createSource;

    $('#overlay').onclick = closeModals;
    $$('[data-close]').forEach(b => b.onclick = closeModals);
    $$('[data-close-drawer]').forEach(b => b.onclick = closeDrawer);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeModals(); closeDrawer(); $('#searchResults').classList.remove('show'); }
    });

    $('#q').addEventListener('input', debounce(doSearch, 380));
    $('#incPersonal').onchange = doSearch;
    $('#q').addEventListener('focus', () => { if ($('#q').value.trim()) doSearch(); });
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) $('#searchResults').classList.remove('show');
    });
    // 点击结果面板空白处也收起，避免挡住下方标签
    $('#searchResults').addEventListener('click', e => {
      if (!e.target.closest('.sr-item')) $('#searchResults').classList.remove('show');
    });
    // 鼠标移出搜索区域时自动收起
    let srTimer = null;
    const sw = document.querySelector('.search-wrap');
    sw.addEventListener('mouseleave', () => {
      srTimer = setTimeout(() => $('#searchResults').classList.remove('show'), 220);
    });
    sw.addEventListener('mouseenter', () => clearTimeout(srTimer));
  }

  /* ------------------------------------------------ 启动 */
  bind();
  boot();
})();
