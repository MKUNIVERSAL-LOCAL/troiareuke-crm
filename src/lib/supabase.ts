// 🔒 CORE — 보호 파일(코어 잠금). 수정 금지. 변경 필요 시 docs/CORE-LOCK.md 의 CORE_EDIT=1 우회 절차.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

// 환경변수 누락 빌드에서 createClient가 throw하면 앱 전체가 흰 화면으로 죽는다.
// 미설정 시 placeholder로 클라이언트를 만들어 두고(호출은 isSupabaseConfigured
// 가드 뒤에서만 일어남) 로컬 폴백 모드로 정상 기동하게 한다.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-anon-key');

// ── 타입 정의 ────────────────────────────────────────────────────

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  shop_type: string | null;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  trial_ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  name: string | null;
  phone: string | null;
  role: 'superadmin' | 'admin' | 'staff';
  branch_id: string | null;
  is_onboarded: boolean;
  created_at: string;
}

export interface LoginLog {
  id: string;
  user_id: string | null;
  email: string;
  branch_id: string | null;
  branch_name: string | null;
  status: 'success' | 'failed';
  fail_reason: string | null;
  device_info: string | null;
  logged_in_at: string;
}
