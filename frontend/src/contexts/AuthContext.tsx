import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi, type LoginParams } from '../api/auth';

interface User {
  id: number;
  username: string;
  email: string;
  phone: string | null;
  display_name: string;
  real_name: string;
  student_id: string | null;
  grade: string | null;
  major: string | null;
  role: string;
  college_id: number | null;
  team_memberships: { team_id: number; team_role: string; tech_partition_id: number | null }[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (params: LoginParams) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true,
  login: async () => {}, logout: () => {}, refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const persistUser = useCallback((u: User) => {
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await authApi.me();
          persistUser(res.data);
          return;
        } catch {
          clearSession();
        }
      }

      // 本地登录/注册页不自动 SSO，避免循环和闪烁。
      if (/\/(login|register)\/?$/.test(window.location.pathname)) {
        setUser(null);
        return;
      }

      // 已登录主站时，同源 Cookie 会自动带上，直接换学术平台 token。
      try {
        const res = await authApi.sso();
        localStorage.setItem('token', res.data.access_token);
        persistUser(res.data.user);
        sessionStorage.removeItem('mq_sso_retry');
      } catch {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [persistUser, clearSession]);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (params: LoginParams) => {
    const res = await authApi.login(params);
    localStorage.setItem('token', res.data.access_token);
    persistUser(res.data.user);
    sessionStorage.removeItem('mq_sso_retry');
  };

  const logout = () => {
    clearSession();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
