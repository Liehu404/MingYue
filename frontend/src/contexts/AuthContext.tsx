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

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    try {
      const res = await authApi.me();
      setUser(res.data);
    } catch {
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (params: LoginParams) => {
    const res = await authApi.login(params);
    localStorage.setItem('token', res.data.access_token);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
