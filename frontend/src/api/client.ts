import axios from 'axios';

const BASE = import.meta.env.BASE_URL;

const client = axios.create({
  baseURL: `${BASE}api/v1`,
  timeout: 30000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = String(err.config?.url || '');
    const isAuthCall = url.includes('/auth/sso') || url.includes('/auth/login');

    if (err.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // 主站会话仍有效时，刷新页面让 AuthContext 重新走一次 SSO；
      // 只重试一次，避免死循环。
      const retryKey = 'mq_sso_retry';
      const inApp = window.location.pathname.startsWith(BASE);
      if (inApp && !sessionStorage.getItem(retryKey)) {
        sessionStorage.setItem(retryKey, '1');
        window.location.reload();
      } else {
        sessionStorage.removeItem(retryKey);
        if (!window.location.pathname.endsWith('/login')) {
          window.location.href = `${BASE}login`;
        }
      }
    }
    return Promise.reject(err);
  },
);

export default client;
