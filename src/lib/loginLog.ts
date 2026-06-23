// 🔒 CORE — 보호 파일(코어 잠금). 수정 금지. 변경 필요 시 docs/CORE-LOCK.md 의 CORE_EDIT=1 우회 절차.
import { supabase, isSupabaseConfigured } from './supabase';

// ── localStorage 기반 폴백 (Supabase 미설정 시) ──────────────────
const LOCAL_KEY = 'troiareuke_login_logs';

interface LocalLog {
  id: string;
  email: string;
  branch_name: string | null;
  status: 'success' | 'failed';
  fail_reason: string | null;
  device_info: string | null;
  logged_in_at: string;
}

function saveLocalLog(log: Omit<LocalLog, 'id'>) {
  try {
    const logs: LocalLog[] = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    logs.unshift({ id: crypto.randomUUID(), ...log });
    // 최대 500건만 유지
    if (logs.length > 500) logs.splice(500);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(logs));
  } catch {}
}

export function getLocalLogs(): LocalLog[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

// ── 로그인 기록 저장 ────────────────────────────────────────────
export async function recordLoginLog({
  userId,
  email,
  branchId,
  branchName,
  status,
  failReason,
}: {
  userId?: string;
  email: string;
  branchId?: string;
  branchName?: string;
  status: 'success' | 'failed';
  failReason?: string;
}) {
  const deviceInfo = navigator.userAgent;
  const loggedInAt = new Date().toISOString();

  if (isSupabaseConfigured) {
    await supabase.from('login_logs').insert({
      user_id: userId || null,
      email,
      branch_id: branchId || null,
      branch_name: branchName || null,
      status,
      fail_reason: failReason || null,
      device_info: deviceInfo,
      logged_in_at: loggedInAt,
    });
  } else {
    saveLocalLog({
      email,
      branch_name: branchName || null,
      status,
      fail_reason: failReason || null,
      device_info: deviceInfo,
      logged_in_at: loggedInAt,
    });
  }
}
