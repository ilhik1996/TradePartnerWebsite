import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, saveToken, clearToken, hasToken } from "@/lib/api";

interface AuthContextType {
  user: any | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { email?: string; phone?: string; password: string; countryId?: number }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!hasToken()) { setLoading(false); return; }
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const login = async (identifier: string, password: string) => {
    const { token, user: u } = await api.auth.login(identifier, password);
    saveToken(token);
    setUser(u);
  };

  const register = async (data: { email?: string; phone?: string; password: string; countryId?: number }) => {
    const { token, user: u } = await api.auth.register(data);
    saveToken(token);
    setUser(u);
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
