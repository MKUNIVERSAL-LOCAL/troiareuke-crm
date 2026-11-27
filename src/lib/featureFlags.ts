// 기능 플래그 해석 엔진 (비코어)
// 우선순위: 지점 오버라이드(어드민) > 전역 설정(어드민) > 레지스트리 기본값.
// 원격 값은 NAS 중앙 서버(/api/feature-flags)에서 받아 localStorage에 캐시한다
// (오프라인·구버전 서버에서는 캐시 → 기본값 순으로 정상 동작).
// deviceToggle이 있는 기능은 어드민 허용 + 기기별 토글이 모두 켜져야 사용된다.

import { setCatalogOverride } from './ai/catalog';
import type { PrefLanded } from './prefLandedRule'; // 설정 저장 판정 (304)
import { FEATURE_MAP } from './featureRegistry';
import { apiRequest, isAuthApiConfigured } from './authApi';
import { getPreference, setPreference } from './shopPreferences';
import { getShopId } from './store';
import { getAppLock, disableAppLock, clearScreenUnlocks } from './appLock';
import { shouldResetAppLock } from './appLockResetRule';
import { notify } from './notify';

const EVENT = 'feature-flags-changed';
const CACHE_KEY = 'crm_feature_flags_cache_v1';

// 구독 실결제 런치 게이트 — PG 계약 정보(VITE_PORTONE_IMP_CODE + VITE_PORTONE_PG)가 빌드에 주입된 경우에만 true.
// 어드민 원격 제어 대상이 아님(계약 전 원격 실수로 켜지는 사고 방지). 테스트 PG 하드코딩은 2026-09-07 제거.
import { isPaymentConfigured } from './payment';
export const PAYMENT_ENABLED = isPaymentConfigured;

type FlagMap = Record<string, boolean>;

interface RemoteFlags {
  global: FlagMap;
  branch: FlagMap;
}

function loadCache(): RemoteFlags {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RemoteFlags>;
      return {
        global: parsed.global && typeof parsed.global === 'object' ? parsed.global : {},
        branch: parsed.branch && typeof parsed.branch === 'object' ? parsed.branch : {},
      };
    }
  } catch {
    /* 캐시 손상 시 기본값 */
  }
  return { global: {}, branch: {} };
}

let remote: RemoteFlags = loadCache();

function emit() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** 어드민(본사) 기준 사용 가능 여부 — 기기 토글은 반영하지 않는다 */
export function isFeatureAllowed(id: string): boolean {
  const def = FEATURE_MAP.get(id);
  if (!def) return false;
  return remote.branch[id] ?? remote.global[id] ?? def.defaultOn;
}

/**
 * 최종 사용 여부 = 어드민 허용 && (지점 토글 있으면 그 값)
 * 지점 토글은 2026-09-07부터 지점 환경설정(shop_settings.preferences.deviceFeatures, 서버 동기)에 저장 —
 * 같은 지점의 모든 PC에 같은 값. 예전 PC별 localStorage 값은 첫 조회 때 한 번 이관된다.
 */
export function isFeatureEnabled(id: string): boolean {
  if (!isFeatureAllowed(id)) return false;
  const def = FEATURE_MAP.get(id);
  if (def?.deviceToggle) {
    const prefs = getPreference('deviceFeatures');
    if (prefs && typeof prefs[id] === 'boolean') return prefs[id];
    try {
      const legacy = localStorage.getItem(def.deviceToggle.key);
      if (legacy !== null) {
        const on = legacy === '1';
        const migrated = setPreference('deviceFeatures', { ...(prefs || {}), [id]: on }); // 1회 이관
        // 304: 290·293(285~292 리뷰 H-1·H-2)과 **같은 길이 여기 남아 있었다** — 새 자리에 남은 것을
        // 확인하기 전에 예전 키를 지우면, 저장 공간이 모자란 PC 에서 이 토글이 **영구 소실**된다.
        // 'landed' 일 때만 지운다(확인 불가면 이중 진실이 잠깐 남을 뿐이고, 되돌릴 수 없는 쪽은 삭제다).
        if (migrated === 'landed') localStorage.removeItem(def.deviceToggle.key);
        return on;
      }
    } catch {
      /* localStorage 불가 환경 */
    }
    return def.deviceToggle.defaultOn;
  }
  return true;
}

/**
 * 지점 사용 토글 저장 (deviceToggle 정의된 기능만 의미 있음) — 서버 동기 설정에 기록.
 * 304: 저장 판정을 돌려준다. 안 남으면 다시 열 때 토글이 되돌아가는데 화면은 "사용 중" 이라고 적고 있었다.
 * 토글이 없는 기능 id 는 invalid (아무것도 바꾸지 않았다는 뜻 — 저장 공간 탓이 아니다).
 */
function setDeviceFeatureEnabled(id: string, on: boolean): PrefLanded {
  const def = FEATURE_MAP.get(id);
  if (!def?.deviceToggle) return 'invalid';
  const landed = setPreference('deviceFeatures', { ...(getPreference('deviceFeatures') || {}), [id]: on });
  emit();
  return landed;
}

/**
 * NAS 서버에서 원격 플래그를 새로 받아온다. Layout 마운트 시 1회 호출.
 * 실패(오프라인·구버전 서버·미연동)해도 캐시/기본값으로 동작하므로 조용히 무시한다.
 */
const LOCK_RESET_SEEN_KEY = 'crm_app_lock_reset_seen'; // 값은 { branchId, iso } — 지점이 다르면 "처음 보는 초기화" 로 (224, 219 리뷰 M-3)

/** 본사가 누른 화면 PIN 초기화를 이 기기에 반영 — 같은 초기화를 두 번 처리하지 않는다 (219) */
async function applyAppLockReset(serverIso: string | null | undefined): Promise<void> {
  const branchId = getShopId();
  let seen: string | null = null;
  try {
    const raw = localStorage.getItem(LOCK_RESET_SEEN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { branchId?: string; iso?: string } | string;
      // 같은 PC 에서 다른 지점으로 재로그인하면(세션 만료 경로는 전체 wipe 를 거치지 않는다) 그 지점의 표식은 쓸 수 없다
      if (typeof parsed === 'object' && parsed && parsed.branchId === branchId) seen = parsed.iso ?? null;
    }
  } catch { /* 저장소 접근 불가·깨진 값 — 서버 값을 따른다 */ }
  if (!shouldResetAppLock(serverIso, seen)) return;
  try { localStorage.setItem(LOCK_RESET_SEEN_KEY, JSON.stringify({ branchId, iso: String(serverIso) })); } catch { /* noop */ }
  const had = !!getAppLock();
  disableAppLock();
  clearScreenUnlocks();
  if (had) notify('본사에서 화면 잠금 PIN을 초기화했습니다. 설정 > 백업·보안에서 새 PIN을 정해주세요.');
}

export async function refreshFeatureFlags(): Promise<void> {
  if (!isAuthApiConfigured) return;
  try {
    const res = await apiRequest<{ global?: FlagMap; branch?: FlagMap; appLockResetAt?: string | null }>('/api/feature-flags');
    void applyAppLockReset(res.appLockResetAt);
    remote = { global: res.global || {}, branch: res.branch || {} };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(remote));
      // 본사가 내려주는 AI 모델 카탈로그('ai.catalog' — 배열) — 검증 통과분만 적용, 없으면 기본 카탈로그 (150·154).
      // 지금 서버의 feature-flags PUT 은 boolean 만 받아 이 값이 내려오지 않는다 — 161(승인 B-2)의 전용 카탈로그 엔드포인트가 이 키를 채운다 (165 리뷰 H-1)
      const cat = (remote as unknown as { global?: Record<string, unknown> }).global?.['ai.catalog'];
      if (Array.isArray(cat)) setCatalogOverride(cat);
    } catch {
      /* 캐시 저장 실패 무시 */
    }
    emit();
  } catch {
    /* 서버 미지원/오프라인 — 기존 캐시 유지 */
  }
}

/**
 * 로그아웃 시 호출 — 같은 기기에서 다른 계정으로 로그인할 때
 * 이전 계정의 지점 플래그가 메모리/캐시에 잔류하는 것을 방지.
 */
export function resetFeatureFlags(): void {
  remote = { global: {}, branch: {} };
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* localStorage 불가 환경 무시 */
  }
  emit();
}

// ── 하위호환 API (기존 호출부: Customers/Settings) ────────────────
export function isBeaconConsultationEnabled(): boolean {
  return isFeatureEnabled('customers.beacon');
}

export function setBeaconConsultationEnabled(on: boolean): PrefLanded {
  return setDeviceFeatureEnabled('customers.beacon', on);
}

// 플래그 변경 구독. 해제 함수를 반환.
export function onFeatureFlagsChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
