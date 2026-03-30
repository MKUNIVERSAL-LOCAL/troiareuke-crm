import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
