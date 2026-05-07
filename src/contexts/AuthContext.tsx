import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { recordLoginLog } from '../lib/loginLog';
import { initializeStores, resetStoreCache, safeSetItem } from '../lib/store';

// 슈퍼어드민 권한은 오직 Supabase의 user_profiles.role === 'superadmin' 로만 판정한다.
// 자격증명을 클라이언트에 절대 하드코딩하지 않는다 (번들에 노출되어 공개되기 때문).

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
  logout: () => Promise<void>;
  completeOnboarding: (shopData: { shopName: string; shopType: string; shopPhone?: string; shopAddress?: string }) => void;
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
  safeSetItem(LOCAL_USERS_KEY, JSON.stringify(users));
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
    safeSetItem(STORAGE_KEY, JSON.stringify(u));
    // Supabase에서 데이터 미리 로드
    initializeStores().catch(() => {});
  };

  // ── 로그인 ───────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
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
  // allow-list: 로그아웃 후에도 잔존해야 하는 키
  // troiareuke_local_users: Supabase 미설정 환경에서 폴백 로그인에 필요
  const LOGOUT_PRESERVE = new Set(['troiareuke_local_users']);

  const logout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    resetStoreCache();

    // allow-list 외 모든 localStorage 키 제거
    // (troiareuke_* API 키/구독/로그, crm_* 고객 캐시, google_calendar_token, ai_key_* 등 전체)
    const allKeys = Object.keys(localStorage);
    for (const key of allKeys) {
      if (!LOGOUT_PRESERVE.has(key)) {
        localStorage.removeItem(key);
      }
    }

    // Service Worker 캐시도 비우기 (타 계정 데이터 캐시 격리)
    if ('caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      } catch {
        // SW 캐시 삭제 실패는 무시
      }
    }
  };

  // ── 온보딩 완료 ──────────────────────────────────────────────
  const completeOnboarding = async (shopData: { shopName: string; shopType: string; shopPhone?: string; shopAddress?: string }) => {
    if (!user) return;

    // ★ branchId는 localStorage에서 이미 확정된 값을 사용 (finish()에서 먼저 설정함)
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedUser = stored ? JSON.parse(stored) : null;
    const branchId = storedUser?.branchId || user.branchId || user.id;

    if (isSupabaseConfigured) {
      try {
        // branches 테이블에 지점 생성/업데이트
        const { error: branchErr } = await supabase.from('branches').upsert({
          id: branchId,
          name: shopData.shopName,
          owner_id: user.id,
          phone: shopData.shopPhone || null,
          address: shopData.shopAddress || null,
          is_active: true,
        }, { onConflict: 'id' });

        if (branchErr) console.error('Branch upsert 실패:', branchErr.message);

        // user_profiles에 branch_id + is_onboarded 연결
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
      branchId,
      branchName: shopData.shopName,
    };
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
