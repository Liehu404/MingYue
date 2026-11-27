/* ===== 明月学术 · 登录态同步（mingyue-auth-sync.js）=====
   背景：本站为 React SPA，站内导航会随登录态自动重渲染，
   但被动态注入的面板（如 /upload 的“批量上传”）以及各页在挂载时抓取的数据，
   不会感知到 localStorage 里 token 的变化 —— 导致“登录/退出后必须手动刷新”。

   本脚本统一监听登录态变化（同页写入 / 跨标签 storage 事件 / 兜底轮询），
   一旦发现 token 变化，就：
     1) 广播 mq:authchange 事件，让注入面板即时响应（如退出时移除“批量上传”）；
     2) 稍作等待（让 React 路由落定）后自动刷新内容：
        - 已登录却停在 /login → 回首页；
        - 其余情况 → 原地刷新，让页面按新身份重新取数。
*/
(function () {
  if (window.__mqAuthSync) return;
  window.__mqAuthSync = true;

  var TOKEN_KEY = 'token';
  var USER_KEY = 'user';

  function readToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function isLoggedIn() { return !!readToken(); }
  function snapshot() { return readToken(); }

  var last = snapshot();
  var reloadScheduled = false;

  function notify() {
    try {
      window.dispatchEvent(new CustomEvent('mq:authchange', {
        detail: { loggedIn: isLoggedIn(), token: readToken() }
      }));
    } catch (e) {}
  }

  function scheduleRefresh() {
    if (reloadScheduled) return;
    reloadScheduled = true;
    notify(); // 先让注入面板即时响应（例如退出时立刻移除“批量上传”）
    // 给 React 的登录跳转/状态更新留出时间，避免刷新时又被弹回登录页
    setTimeout(function () {
      try {
        if (isLoggedIn() && /^\/academic\/login\/?$/.test(location.pathname)) {
          location.replace('/academic/');
        } else {
          location.reload();
        }
      } catch (e) {
        try { location.reload(); } catch (e2) {}
      }
    }, 450);
  }

  function check() {
    var cur = snapshot();
    if (cur !== last) {
      last = cur;
      scheduleRefresh();
    }
  }

  // 1) 同页面内的写入/删除（React 登录/退出走的就是这里）
  try {
    var _set = localStorage.setItem.bind(localStorage);
    var _rem = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      _set(k, v);
      if (k === TOKEN_KEY || k === USER_KEY) check();
    };
    localStorage.removeItem = function (k) {
      _rem(k);
      if (k === TOKEN_KEY || k === USER_KEY) check();
    };
  } catch (e) {}

  // 2) 跨标签页
  window.addEventListener('storage', function (e) {
    if (!e || e.key === TOKEN_KEY || e.key === null) check();
  });

  // 3) 兜底轮询（防止有代码绕过上面的拦截）
  setInterval(check, 800);

  // 对外暴露，便于其它脚本读取当前登录态
  window.mqAuth = { loggedIn: isLoggedIn, token: readToken };

  notify();
})();
