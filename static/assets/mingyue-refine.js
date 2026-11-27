/* ===== 明月学术 · 界面微调（mingyue-refine.js）2026-09-10 =====
   1) 站点名称统一为「明月学术交流平台（MY RESEARCH OS）」
   2) 文档类资源卡片：用「文字摘要」预览替代通用的文件图标占位
   （卡片不可见 bug 由 mingyue-refine.css 处理） */
(function () {
  if (window.__mqRefine) return;
  window.__mqRefine = true;

  /* ---------------- 1) 站点名称 ---------------- */
  var SITE_NAME = '明月学术交流平台';
  var SITE_FULL = '明月学术交流平台（MY RESEARCH OS）';

  var NAME_SELECTORS = [
    '.global-brand-title',
    '.global-brand-subtitle',
    '.sub-nav-title',
    '.auth-shell-title',
    '.text-glow-subtle',
    '.mingyue-literary-brand'
  ];

  function renameText(s) {
    if (!s) return s;
    var t = s.trim();
    if (t === '明月学术 Research OS') return SITE_FULL;
    if (t === 'Research OS') return 'MY RESEARCH OS';
    if (t === SITE_NAME) return s;
    // 已经包含新名称 → 不再重复替换，避免无限叠加
    if (t.indexOf(SITE_NAME) >= 0) return s;
    if (t.indexOf('明月学术平台') >= 0) return s.replace(/明月学术平台/g, SITE_NAME);
    if (t.indexOf('明月学术') >= 0) return s.replace(/明月学术/g, SITE_NAME);
    return s;
  }

  function applyNames() {
    NAME_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        // 遍历全部文本节点，保留内部结构（如页脚的院徽图片）
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        var node;
        while ((node = walker.nextNode())) {
          var next = renameText(node.nodeValue);
          if (next !== node.nodeValue) node.nodeValue = next;
        }
      });
    });
    if (document.title !== SITE_FULL) document.title = SITE_FULL;
  }

  /* ---------------- 2) 文档卡片的文字预览 ---------------- */
  var docMap = null;      // title -> 纯文本摘要
  var attMap = null;      // title -> 附件数量
  var docMapLoading = false;

  function token() { try { return localStorage.getItem('token') || ''; } catch (e) { return ''; } }

  function fetchDocs() {
    if (docMapLoading) return;
    docMapLoading = true;
    var h = {};
    var t = token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    // 修复：后端分页参数是 page_size（limit 被忽略 → 只会拿到默认 20 条，
    // 导致第 20 条之后的文档卡片拿不到正文摘要）。
    fetch('/academic/api/v1/resources?page_size=200', { headers: h })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var items = Array.isArray(d) ? d : (d && (d.items || d.resources)) || [];
        var map = {};
        var amap = {};
        items.forEach(function (it) {
          var title = (it.title || '').trim();
          var n = (it.attachments || []).length;
          if (n) amap[title] = n;
          if (it.resource_type !== 'document') return;
          var text = plain(it.content) || plain(it.description);
          if (text) map[title] = text;
        });
        docMap = map;
        attMap = amap;
      })
      .catch(function () { docMap = {}; })
      .then(function () { docMapLoading = false; });
  }

  function plain(md) {
    return String(md || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s*/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/[*_`~]/g, '')
      .replace(/\$\$?[^$\n]*\$\$?/g, ' ')
      .replace(/^\s*[-+*]\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isDocCard(media) {
    return !!media && /M14\.5 2H6a2 2 0 00-2 2v16/.test(media.innerHTML || '');
  }

  function applyAttBadges() {
    if (!attMap) return;
    document.querySelectorAll('.resource-card').forEach(function (card) {
      var h3 = card.querySelector('h3');
      var title = h3 ? (h3.textContent || '').trim() : '';
      if (!title) return;
      var n = attMap[title] || 0;
      var badge = card.querySelector('.mq-att-badge');
      if (!n) { if (badge) badge.remove(); return; }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'mq-att-badge';
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;' +
          'color:#682080;background:#f4edfa;border-radius:999px;padding:1px 8px;margin-left:6px;vertical-align:middle;';
        if (h3 && h3.parentElement) h3.parentElement.insertBefore(badge, h3.nextSibling);
        else card.appendChild(badge);
      }
      badge.textContent = '📎 ' + n;
    });
  }

  function applyPreviews() {
    var cards = document.querySelectorAll('.resource-card');
    if (!cards.length) return;
    if (docMap === null) { fetchDocs(); return; }

    cards.forEach(function (card) {
      var media = card.querySelector('.resource-card-media');
      if (!media || !isDocCard(media)) return;
      if (media.dataset.mqDocPrev === '1') return;

      var h3 = card.querySelector('h3');
      var title = h3 ? (h3.textContent || '').trim() : '';
      var text = (title && docMap[title]) || '';

      // 从卡片已有的描述兜底
      if (!text) {
        var ps = card.querySelectorAll('p');
        for (var i = 0; i < ps.length; i++) {
          var s = (ps[i].textContent || '').trim();
          if (s.length > 24) { text = s; break; }
        }
      }
      if (!text) return;

      var excerpt = text.slice(0, 150);
      media.innerHTML =
        '<div class="mq-docprev-inner">' +
        '<div class="mq-docprev-meta">文档摘要</div>' +
        '<div class="mq-docprev-text">' + excerpt.replace(/[&<>]/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
        }) + '</div></div>';
      media.classList.add('mq-docprev');
      media.dataset.mqDocPrev = '1';
    });
  }

  /* ---------------- 调度 ---------------- */
  var timer = null;
  function run() {
    try { applyNames(); } catch (e) {}
    try { applyPreviews(); } catch (e) {}
    try { applyAttBadges(); } catch (e) {}
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; run(); }, 120);
  }

  try {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true
    });
  } catch (e) {}
  setInterval(run, 1200);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  window.addEventListener('mq:authchange', function () { docMap = null; schedule(); });
})();
