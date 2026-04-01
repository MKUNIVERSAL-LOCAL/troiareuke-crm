import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { recordLoginLog } from '../lib/loginLog';
import { initializeStores, resetStoreCache } from '../lib/store';

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
  completeOnboarding: (shopData: { shopName: string; shopType: string; shopPhone?: string; shopAddress?: string }) => void;
  isAdminEmail: (email: string) => boolean;
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
    // localStorage에 저장된 세션이 있으면 먼저 복원 (로딩 속도 개선)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem(STORAGE_KEY); }
    }

    if (isSupabaseConfigured) {
      // 5초 타임아웃: Supabase 연결 실패 시 localStorage 폴백
      const timeout = setTimeout(() => {
        setIsLoading(false);
      }, 5000);

      // Supabase 세션 복원
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        clearTimeout(timeout);
        if (session?.user) {
          const profile = await loadProfile(session.user.id, session.user.email!);
          saveUser(profile);
        }
        setIsLoading(false);
      }).catch(() => {
        clearTimeout(timeout);
        // Supabase 연결 실패 — localStorage 데이터로 계속 진행
        setIsLoading(false);
      });

      // 세션 변경 구독
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const profile = await loadProfile(session.user.id, session.user.email!);
          saveUser(profile);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          localStorage.removeItem(STORAGE_KEY);
        }
      });

      return () => subscription.unsubscribe();
    } else {
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
    // Supabase에서 데이터 미리 로드
    initializeStores().catch(() => {});
  };

  // ── 어드민 이메일 체크 (로그인 전 리다이렉트 판단용) ────────
  const isAdminEmail = (email: string) => email === SUPERADMIN_EMAIL;

  // ── 슈퍼어드민 로컬 로그인 헬퍼 ─────────────────────────────
  const loginSuperadminLocal = async (email: string): Promise<boolean> => {
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
    return true;
  };

  // ── 로그인 ───────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    // 슈퍼어드민 계정은 항상 로컬에서 처리 (Supabase 설정 여부 무관)
    if (email === SUPERADMIN_EMAIL && password === SUPERADMIN_PASSWORD) {
      await loginSuperadminLocal(email);
      return;
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        // Supabase 실패 시 로컬 유저도 체크
        const localUsers = getLocalUsers();
        const found = localUsers.find(u => u.email === email && u.passwordHash === password);
        if (found) {
          await recordLoginLog({ userId: found.user.id, email, branchName: found.user.branchName, status: 'success' });
          saveUser(found.user);
          return;
        }
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

      saveUser(profile);
    } else {
      // ── 로컬 폴백 로그인 ──
      await new Promise(r => setTimeout(r, 600));

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
    resetStoreCache();
  };

  // ── 온보딩 완료 ──────────────────────────────────────────────
  const completeOnboarding = async (shopData: { shopName: string; shopType: string; shopPhone?: string; shopAddress?: string }) => {
    if (!user) return;

    let branchId = user.branchId;

    if (isSupabaseConfigured) {
      try {
        // 1) branches 테이블에 지점 생성 (없으면 새로 만듦)
        if (!branchId) {
          const { data: branchData, error: branchErr } = await supabase.from('branches').insert({
            name: shopData.shopName,
            owner_id: user.id,
            phone: shopData.shopPhone || null,
            address: shopData.shopAddress || null,
            is_active: true,
          }).select('id').single();

          if (!branchErr && branchData) {
            branchId = branchData.id;
          }
        } else {
          // 이미 있으면 업데이트
          await supabase.from('branches').update({
            name: shopData.shopName,
            phone: shopData.shopPhone || null,
            address: shopData.shopAddress || null,
          }).eq('id', branchId);
        }

        // 2) user_profiles에 branch_id + is_onboarded 연결
        await supabase.from('user_profiles').update({
          is_onboarded: true,
          branch_id: branchId,
        }).eq('id', user.id);
      } catch (e) {
        console.error('Supabase 온보딩 저장 실패 (로컬로 진행):', e);
      }
    }

    const updated = {
      ...user,
      ...shopData,
      isOnboarded: true,
      branchId: branchId || user.id,
      branchName: shopData.shopName,
    };
    saveUser(updated);
  };

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, isLoading, login, signup, logout, completeOnboarding, isAdminEmail,
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
