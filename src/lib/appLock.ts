// ═══════════════════════════════════════════════════════════════
// appLock — 앱 잠금(PIN) (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 공용 PC·매장 태블릿에서 자리를 비운 사이 고객 정보가 노출되지 않게, 화면을 떠났다가 돌아오면 PIN을 묻는다.
// PIN 해시와 잠금 대기 시간은 기기별(localStorage) — 기기마다 다른 PIN을 쓸 수 있고 서버에는 올리지 않는다.
// 기본 OFF. PIN을 잊으면 로그아웃(서버 모드)으로 해제하고 다시 로그인한다.
// ═══════════════════════════════════════════════════════════════

const KEY = 'crm_app_lock';
export const APP_LOCK_CHANGED_EVENT = 'crm:app-lock-changed';

export interface AppLockConfig {
  hash: string;       // PIN 해시 (SHA-256 hex, SubtleCrypto 불가 시 폴백 해시)
  timeoutMin: number; // 0 = 화면을 떠나면 즉시
}

export const LOCK_TIMEOUTS: { value: number; label: string }[] = [
  { value: 0, label: '즉시' },
  { value: 1, label: '1분' },
  { value: 5, label: '5분' },
  { value: 15, label: '15분' },
];

export function getAppLock(): AppLockConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.hash === 'string' ? { hash: parsed.hash, timeoutMin: Number(parsed.timeoutMin) || 0 } : null;
  } catch {
    return null;
  }
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`crm-app-lock:${pin}`);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // 비보안 컨텍스트 폴백(FNV-1a) — 기기 로컬 보호 용도
  let h = 0x811c9dc5;
  for (const b of data) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return `fnv:${h.toString(16)}`;
}

function emit(): void {
  try { window.dispatchEvent(new Event(APP_LOCK_CHANGED_EVENT)); } catch { /* noop */ }
}

export async function enableAppLock(pin: string, timeoutMin: number): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN은 숫자 4~6자리여야 합니다.');
  const cfg: AppLockConfig = { hash: await hashPin(pin), timeoutMin: Math.max(0, timeoutMin) };
  localStorage.setItem(KEY, JSON.stringify(cfg));
  emit();
}

export function disableAppLock(): void {
  localStorage.removeItem(KEY);
  emit();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const cfg = getAppLock();
  if (!cfg) return true;
  return (await hashPin(pin)) === cfg.hash;
}
