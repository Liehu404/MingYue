/* 主站单点登录引导 + 学术平台退出保护
 *
 * - 有 token：正常已登录，清掉“本次不自动 SSO”标记。
 * - 无 token 且标记为已退出：不再自动 SSO，避免主站会话立刻把用户登回来。
 * - 点击“退出”/数据管理页退出按钮：先清 token、打标记，再兜底跳到登录页。
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

  // 捕获阶段先处理退出，避免 React/原生页面把 token 又写回来。
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest
      ? e.target.closest('a,button,[role="button"]')
      : null;
    if (!el) return;
    var text = (el.textContent || '').trim();
    var title = el.getAttribute('title') || '';
    if (el.id === 'btnLogout' || text === '退出' || text === '退出登录' || title.indexOf('退出') >= 0) {
      markLogout();
      setTimeout(function () {
        if (!hasToken() && location.pathname.indexOf('/academic/login') < 0) {
          location.replace('/academic/login');
        }
      }, 80);
    }
  }, true);

  // 浏览器回退如果命中 bfcache，强制重新加载，让退出状态生效。
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && sessionStorage.getItem(KEY) && !hasToken()) {
      location.reload();
    }
  });

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
