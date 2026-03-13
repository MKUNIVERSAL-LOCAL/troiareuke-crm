import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  shopName: string;
  shopType: string;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  trialEndsAt: string;
  isOnboarded: boolean;
  createdAt: string;
}

interface SignupData {
  email: string;
  password: string;
  name: string;
  phone: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  completeOnboarding: (shopData: { shopName: string; shopType: string }) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = 'troiareuke_auth_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem(STORAGE_KEY); }
    }
    setIsLoading(false);
  }, []);

  const saveUser = (u: AuthUser) => {
    setUser(u);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  };

  const login = async (email: string, _password: string) => {
    await new Promise(r => setTimeout(r, 800));
    // 데모: 아무 이메일/비밀번호로 로그인 가능
    const u: AuthUser = {
      id: 'user_' + Date.now(),
      email,
      name: email.split('@')[0],
      shopName: '',
      shopType: '',
      plan: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      isOnboarded: false,
      createdAt: new Date().toISOString(),
    };
    // 기존 유저면 온보딩 완료 처리
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const prev = JSON.parse(stored);
      if (prev.email === email) { saveUser(prev); return; }
    }
    saveUser(u);
  };

  const signup = async (data: SignupData) => {
    await new Promise(r => setTimeout(r, 1000));
    const u: AuthUser = {
      id: 'user_' + Date.now(),
      email: data.email,
      name: data.name,
      phone: data.phone,
      shopName: '',
      shopType: '',
      plan: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      isOnboarded: false,
      createdAt: new Date().toISOString(),
    };
    saveUser(u);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const completeOnboarding = (shopData: { shopName: string; shopType: string }) => {
    if (!user) return;
    const updated = { ...user, ...shopData, isOnboarded: true };
    saveUser(updated);
  };

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, isLoading, login, signup, logout, completeOnboarding,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
