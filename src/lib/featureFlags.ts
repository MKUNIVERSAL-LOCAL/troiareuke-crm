// 기능 플래그 해석 엔진 (비코어)
// 우선순위: 지점 오버라이드(어드민) > 전역 설정(어드민) > 레지스트리 기본값.
// 원격 값은 NAS 중앙 서버(/api/feature-flags)에서 받아 localStorage에 캐시한다
// (오프라인·구버전 서버에서는 캐시 → 기본값 순으로 정상 동작).
// deviceToggle이 있는 기능은 어드민 허용 + 기기별 토글이 모두 켜져야 사용된다.

import { FEATURE_MAP } from './featureRegistry';
import { apiRequest, isAuthApiConfigured } from './authApi';

const EVENT = 'feature-flags-changed';
const CACHE_KEY = 'crm_feature_flags_cache_v1';

// 구독 실결제 런치 게이트. 실 PG(포트원) 계약·검수 완료 전까지 false.
// 어드민 원격 제어 대상이 아님 — 계약 전 원격 실수로 켜지는 사고를 막기 위해 하드코딩 유지.
export const PAYMENT_ENABLED = false;

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

/** 최종 사용 여부 = 어드민 허용 && (기기 토글 있으면 그 값) */
export function isFeatureEnabled(id: string): boolean {
  if (!isFeatureAllowed(id)) return false;
  const def = FEATURE_MAP.get(id);
  if (def?.deviceToggle) {
    try {
      const v = localStorage.getItem(def.deviceToggle.key);
      if (v !== null) return v === '1';
    } catch {
      /* localStorage 불가 환경 */
    }
    return def.deviceToggle.defaultOn;
  }
  return true;
}

/** 기기별 사용 토글 저장 (deviceToggle 정의된 기능만 의미 있음) */
export function setDeviceFeatureEnabled(id: string, on: boolean): void {
  const def = FEATURE_MAP.get(id);
  if (!def?.deviceToggle) return;
  try {
    localStorage.setItem(def.deviceToggle.key, on ? '1' : '0');
  } catch {
    /* localStorage 불가 환경 무시 */
  }
  emit();
}

/**
 * NAS 서버에서 원격 플래그를 새로 받아온다. Layout 마운트 시 1회 호출.
 * 실패(오프라인·구버전 서버·미연동)해도 캐시/기본값으로 동작하므로 조용히 무시한다.
 */
export async function refreshFeatureFlags(): Promise<void> {
  if (!isAuthApiConfigured) return;
  try {
    const res = await apiRequest<{ global?: FlagMap; branch?: FlagMap }>('/api/feature-flags');
    remote = { global: res.global || {}, branch: res.branch || {} };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(remote));
    } catch {
      /* 캐시 저장 실패 무시 */
    }
    emit();
  } catch {
    /* 서버 미지원/오프라인 — 기존 캐시 유지 */
  }
}

// ── 하위호환 API (기존 호출부: Customers/Settings) ────────────────
export function isBeaconConsultationEnabled(): boolean {
  return isFeatureEnabled('customers.beacon');
}

export function setBeaconConsultationEnabled(on: boolean): void {
  setDeviceFeatureEnabled('customers.beacon', on);
}

// 플래그 변경 구독. 해제 함수를 반환.
export function onFeatureFlagsChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
