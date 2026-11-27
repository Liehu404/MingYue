/* 主站单点登录引导：在 React bundle 之前执行。
 * 同源请求会带上主站 Flask session cookie；拿到学术平台 token 后写入
 * localStorage，再刷新页面，让 React 的 AuthContext 按正常已登录流程启动。
 */
(function () {
  try {
    if (localStorage.getItem('token')) return;
    fetch('/academic/api/v1/auth/sso', { method: 'POST', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.access_token) {
          localStorage.setItem('token', d.access_token);
          if (d.user) localStorage.setItem('user', JSON.stringify(d.user));
          location.reload();
        }
      })
      .catch(function () { });
  } catch (e) { }
})();
