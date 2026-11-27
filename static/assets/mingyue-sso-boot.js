/* 主站单点登录引导 + 学术平台退出保护
 *
 * - 有 token：正常已登录，清掉“本次不自动 SSO”标记。
 * - 无 token 且标记为已退出：不再自动 SSO，避免主站会话立刻把用户登回来。
 * - 点击“退出”：清学术平台 token、打退出标记，然后回到主站首页。
 * - 从主站“学术交流”入口进入时，主站链接会清除标记，恢复自动 SSO。
 */
(function () {
  var KEY = 'mq_sso_disabled';

  function hasToken() {
    try { return !!localStorage.getItem('token'); } catch (e) { return false; }
  }

  function markLogout() {
    try {
      sessionStorage.setItem(KEY, '1');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch (e) { }
  }

  // 捕获阶段接管退出：清学术态后直接回主站，避免 React 先跳到 /academic/login。
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest
      ? e.target.closest('a,button,[role="button"]')
      : null;
    if (!el) return;
    var text = (el.textContent || '').trim();
    var title = el.getAttribute('title') || '';
    if (el.id === 'btnLogout' || text === '退出' || text === '退出登录' || title.indexOf('退出') >= 0) {
      e.preventDefault();
      e.stopPropagation();
      markLogout();
      location.replace('/');  // 回到明月大模型主站
    }
  }, true);

  // 浏览器回退如果命中 bfcache，强制重新加载，让退出状态生效。
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && sessionStorage.getItem(KEY) && !hasToken()) {
      location.reload();
    }
  });

  // 给学术平台一个随时可用的“返回主站”入口（尤其登录页）。
  function addBackLink() {
    try {
      if (document.getElementById('mq-back-main')) return;
      var a = document.createElement('a');
      a.id = 'mq-back-main';
      a.href = '/';
      a.textContent = '← 返回主站';
      a.style.cssText = [
        'position:fixed', 'left:20px', 'bottom:20px', 'z-index:50',
        'padding:9px 15px', 'border-radius:999px',
        'background:rgba(104,32,128,.92)', 'color:#fff',
        'font-size:13px', 'text-decoration:none',
        'box-shadow:0 8px 22px rgba(74,16,99,.25)',
        'font-family:"PingFang SC","Microsoft YaHei",sans-serif',
        'letter-spacing:.03em',
      ].join(';');
      document.body.appendChild(a);
    } catch (e) { }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addBackLink);
  } else {
    addBackLink();
  }

  try {
    if (hasToken()) {
      sessionStorage.removeItem(KEY);
      return;
    }
    if (sessionStorage.getItem(KEY)) return;

    fetch('/academic/api/v1/auth/sso', { method: 'POST', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.access_token) {
          localStorage.setItem('token', d.access_token);
          if (d.user) localStorage.setItem('user', JSON.stringify(d.user));
          sessionStorage.removeItem(KEY);
          location.reload();
        }
      })
      .catch(function () { });
  } catch (e) { }
})();
