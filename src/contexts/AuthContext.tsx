import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { recordLoginLog } from '../lib/loginLog';

// ── 슈퍼어드민 계정 (Supabase 미설정 시 로컬 폴백용) ────────────
const SUPERADMIN_EMAIL = 'mkclub21@gmail.com';
const SUPERADMIN_PASSWORD = 'Dlalrud681207@@';

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
  role: 'superadmin' | 'admin' | 'staff';
  branchId?: string;
  branchName?: string;
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

// ── 로컬 유저 DB (Supabase 미설정 시) ───────────────────────────
const LOCAL_USERS_KEY = 'troiareuke_local_users';

interface LocalUserRecord {
  email: string;
  passwordHash: string; // 실제로는 평문 (로컬 전용)
  user: AuthUser;
}

function getLocalUsers(): LocalUserRecord[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]'); } catch { return []; }
}

function saveLocalUser(record: LocalUserRecord) {
  const users = getLocalUsers().filter(u => u.email !== record.email);
  users.push(record);
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

// ── AuthProvider ─────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 앱 시작 시 세션 복원
  useEffect(() => {
    if (isSupabaseConfigured) {
      // Supabase 세션 복원
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session?.user) {
          const profile = await loadProfile(session.user.id, session.user.email!);
          setUser(profile);
        }
        setIsLoading(false);
      });

      // 세션 변경 구독
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const profile = await loadProfile(session.user.id, session.user.email!);
          setUser(profile);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      // localStorage 폴백
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem(STORAGE_KEY); }
      }
      setIsLoading(false);
    }
  }, []);

  // Supabase에서 user_profiles 로드
  async function loadProfile(userId: string, email: string): Promise<AuthUser> {
    const { data } = await supabase
      .from('user_profiles')
      .select('*, branches(name, shop_type, plan, trial_ends_at)')
      .eq('id', userId)
      .single();

    if (data) {
      return {
        id: userId,
        email,
        name: data.name || email.split('@')[0],
        phone: data.phone,
        shopName: data.branches?.name || '',
        shopType: data.branches?.shop_type || '',
        plan: data.branches?.plan || 'trial',
        trialEndsAt: data.branches?.trial_ends_at || new Date(Date.now() + 14 * 86400000).toISOString(),
        isOnboarded: data.is_onboarded,
        role: data.role || 'staff',
        branchId: data.branch_id,
        branchName: data.branches?.name,
        createdAt: data.created_at,
      };
    }

    // user_profiles 없으면 기본값 반환 (신규 가입)
    return {
      id: userId,
      email,
      name: email.split('@')[0],
      shopName: '',
      shopType: '',
      plan: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      isOnboarded: false,
      role: 'staff',
      createdAt: new Date().toISOString(),
    };
  }

  const saveUser = (u: AuthUser) => {
    setUser(u);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  };

  // ── 로그인 ───────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        await recordLoginLog({ email, status: 'failed', failReason: error.message });
        throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
      }

      const profile = await loadProfile(data.user.id, email);
      await recordLoginLog({
        userId: data.user.id,
        email,
        branchId: profile.branchId,
        branchName: profile.branchName,
        status: 'success',
      });

      setUser(profile);
    } else {
      // ── 로컬 폴백 로그인 ──
      await new Promise(r => setTimeout(r, 600));

      // 슈퍼어드민 계정 체크
      if (email === SUPERADMIN_EMAIL && password === SUPERADMIN_PASSWORD) {
        const adminUser: AuthUser = {
          id: 'superadmin',
          email: SUPERADMIN_EMAIL,
          name: '관리자',
          shopName: 'TROIAREUKE 본사',
          shopType: '관리자',
          plan: 'enterprise',
          trialEndsAt: new Date(Date.now() + 365 * 86400000).toISOString(),
          isOnboarded: true,
          role: 'superadmin',
          createdAt: new Date().toISOString(),
        };
        await recordLoginLog({ userId: 'superadmin', email, status: 'success', branchName: '본사' });
        saveUser(adminUser);
        return;
      }

      // 일반 유저 로컬 체크
      const localUsers = getLocalUsers();
      const found = localUsers.find(u => u.email === email && u.passwordHash === password);

      if (!found) {
        await recordLoginLog({ email, status: 'failed', failReason: '이메일 또는 비밀번호 불일치' });
        throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
      }

      await recordLoginLog({ userId: found.user.id, email, branchName: found.user.branchName, status: 'success' });
      saveUser(found.user);
    }
  };

  // ── 회원가입 ─────────────────────────────────────────────────
  const signup = async (data: SignupData) => {
    if (isSupabaseConfigured) {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { name: data.name, phone: data.phone } },
      });
      if (error) throw new Error(error.message);

      if (authData.user) {
        await supabase.from('user_profiles').upsert({
          id: authData.user.id,
          name: data.name,
          phone: data.phone,
          role: 'admin',
          is_onboarded: false,
        });
      }
    } else {
      await new Promise(r => setTimeout(r, 800));
      const newUser: AuthUser = {
        id: 'user_' + Date.now(),
        email: data.email,
        name: data.name,
        phone: data.phone,
        shopName: '',
        shopType: '',
        plan: 'trial',
        trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
        isOnboarded: false,
        role: 'admin',
        createdAt: new Date().toISOString(),
      };
      saveLocalUser({ email: data.email, passwordHash: data.password, user: newUser });
      saveUser(newUser);
    }
  };

  // ── 로그아웃 ─────────────────────────────────────────────────
  const logout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  // ── 온보딩 완료 ──────────────────────────────────────────────
  const completeOnboarding = async (shopData: { shopName: string; shopType: string }) => {
    if (!user) return;
    const updated = { ...user, ...shopData, isOnboarded: true };

    if (isSupabaseConfigured) {
      await supabase.from('user_profiles').update({ is_onboarded: true }).eq('id', user.id);
      // 지점 정보 업데이트 (branch_id가 있는 경우)
      if (user.branchId) {
        await supabase.from('branches').update({
          name: shopData.shopName,
          shop_type: shopData.shopType,
        }).eq('id', user.branchId);
      }
    }

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
