// 🔒 CORE — 보호 파일(코어 잠금). 수정 금지. 변경 필요 시 docs/CORE-LOCK.md 의 CORE_EDIT=1 우회 절차.
//
// 로그인 기록 — 정본은 NAS 중앙 서버(auth_login_log, /api/auth/login에서 서버가 직접 기록).
// 이 파일은 이 기기의 로컬 보조 기록만 담당한다: 서버가 구버전이거나 오프라인일 때 어드민 화면·데이터 내보내기의 폴백.
// (2026-09-07 오너 승인: Supabase login_logs 경로 제거 — 서버 정본 도입으로 불필요)

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

// ── 로그인 기록 저장 (로컬 보조) ──────────────────────────────────
export async function recordLoginLog({
  email,
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
  saveLocalLog({
    email,
    branch_name: branchName || null,
    status,
    fail_reason: failReason || null,
    device_info: navigator.userAgent,
    logged_in_at: new Date().toISOString(),
  });
}
