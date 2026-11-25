// ═══════════════════════════════════════════════════════════════
// appLock — 앱 잠금(PIN) (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 공용 PC·매장 태블릿에서 자리를 비운 사이 고객 정보가 노출되지 않게, 화면을 떠났다가 돌아오면 PIN을 묻는다.
// PIN 해시와 잠금 대기 시간은 기기별(localStorage) — 기기마다 다른 PIN을 쓸 수 있고 서버에는 올리지 않는다.
// 기본 OFF. PIN을 잊으면 로그아웃(서버 모드)으로 해제하고 다시 로그인한다.
// ═══════════════════════════════════════════════════════════════

import { isAuthApiConfigured } from './authApi';

const KEY = 'crm_app_lock';
export const APP_LOCK_CHANGED_EVENT = 'crm:app-lock-changed';
/**
 * 서버(NAS) 모드에서만 제공 — 로컬 모드는 로그인이 없어 "PIN을 잊었을 때" 되돌릴 신원이 없고, 끄기 버튼을 두면 장식 잠금이 된다(리뷰 2026-11-18).
 * E2E는 로컬 모드 빌드(--mode e2e)라 잠금 흐름 검증을 위해서만 예외.
 */
export const APP_LOCK_AVAILABLE: boolean = isAuthApiConfigured || import.meta.env.MODE === 'e2e';

export interface AppLockConfig {
  hash: string;       // PIN 해시 (SHA-256 hex, SubtleCrypto 불가 시 폴백 해시)
  timeoutMin: number; // 0 = 화면을 떠나면 즉시
  /** PIN 을 물을 민감 화면 키 목록 (218) — 비면 화면 잠금 없음 */
  screens?: ScreenKey[];
  /**
   * 앱 시작·자리 비움 복귀에 **전체 화면**을 잠글지 (218b). 기본 true(2026-11-18 부터의 기존 동작).
   * 샵 계정 하나로 쓰면서 민감 화면만 막고 싶을 때는 false — 직원이 프로그램은 쓰고, 고른 화면에서만 PIN 을 묻는다.
   */
  awayLock?: boolean;
}

/**
 * 민감 화면 (218) — 샵은 보통 계정 하나로 운영해서(가입 1계정, 지점 앱에 계정 추가 화면 없음) 역할 분리가 작동하지 않는다.
 * 그래서 같은 계정 안에서 "이 화면은 PIN을 묻기" 로 차등을 둔다. 매일 쓰는 예약·시술은 목록에 두지 않는다.
 */
export const SENSITIVE_SCREENS = [
  { key: 'sales', label: '매출·손익', path: '/sales' },
  { key: 'settings', label: '설정', path: '/settings' },
  { key: 'messaging', label: '문자/카카오', path: '/messaging' },
  { key: 'customers', label: '고객 목록', path: '/customers' },
  { key: 'staff', label: '직원 관리', path: '/staff' },
] as const;
export type ScreenKey = typeof SENSITIVE_SCREENS[number]['key'];

/** 경로 → 민감 화면 키 (하위 경로 포함) */
export function screenKeyForPath(pathname: string): ScreenKey | null {
  for (const s of SENSITIVE_SCREENS) if (pathname === s.path || pathname.startsWith(s.path + '/')) return s.key;
  return null;
}
export function screenLabel(key: ScreenKey): string {
  return SENSITIVE_SCREENS.find(s => s.key === key)?.label ?? key;
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
    if (!parsed || typeof parsed.hash !== 'string') return null;
    const keys = new Set<string>(SENSITIVE_SCREENS.map(s => s.key));
    const screens = Array.isArray(parsed.screens) ? parsed.screens.filter((k: unknown): k is ScreenKey => typeof k === 'string' && keys.has(k)) : [];
    return { hash: parsed.hash, timeoutMin: Number(parsed.timeoutMin) || 0, screens, awayLock: parsed.awayLock !== false };
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

export async function enableAppLock(pin: string, timeoutMin: number, screens: ScreenKey[] = [], awayLock = true): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN은 숫자 4~6자리여야 합니다.');
  const cfg: AppLockConfig = { hash: await hashPin(pin), timeoutMin: Math.max(0, timeoutMin), screens, awayLock };
  localStorage.setItem(KEY, JSON.stringify(cfg));
  emit();
}

/** 전체 잠금(앱 시작·자리 비움) 스위치만 바꾼다 — PIN·화면 목록은 그대로 (218b) */
export function setAwayLock(on: boolean): void {
  const cfg = getAppLock();
  if (!cfg) return;
  localStorage.setItem(KEY, JSON.stringify({ ...cfg, awayLock: on }));
  emit();
}

/** 잠글 화면 목록만 바꾼다 — PIN 을 다시 묻지 않는다(설정 화면 자체를 잠갔다면 이미 PIN 을 통과해 들어왔다) (218) */
export function setLockedScreens(screens: ScreenKey[]): void {
  const cfg = getAppLock();
  if (!cfg) return;
  localStorage.setItem(KEY, JSON.stringify({ ...cfg, screens }));
  unlocked.clear(); // 방금 잠근 화면이 바로 막히게
  emit();
}

// ── 이번 실행 동안 풀어 둔 화면 (메모리만 — 새로고침·재시작하면 다시 묻는다) ──
const unlocked = new Set<ScreenKey>();
/** 그 화면이 지금 PIN 을 물어야 하는가 */
export function screenNeedsPin(pathname: string): ScreenKey | null {
  if (!APP_LOCK_AVAILABLE) return null;
  const cfg = getAppLock();
  if (!cfg || !cfg.screens?.length) return null;
  const key = screenKeyForPath(pathname);
  if (!key || !cfg.screens.includes(key) || unlocked.has(key)) return null;
  return key;
}
export function markScreenUnlocked(key: ScreenKey): void { unlocked.add(key); emit(); }
/** 앱 잠금이 걸릴 때(자리 비움 복귀)·로그아웃 때 — 민감 화면도 다시 묻게 (218) */
export function clearScreenUnlocks(): void { unlocked.clear(); }

export function disableAppLock(): void {
  localStorage.removeItem(KEY);
  emit();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const cfg = getAppLock();
  if (!cfg) return true;
  return (await hashPin(pin)) === cfg.hash;
}
