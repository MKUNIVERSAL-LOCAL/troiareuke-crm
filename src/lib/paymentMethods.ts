// 결제수단 공용 목록 — 기본 4종 + 매장에서 직접 추가한 커스텀 수단.
// 커스텀 수단은 지점 환경설정(shop_settings.preferences.customPaymentMethods)에 저장되어
// NAS로 동기화된다 — 어느 PC에서 추가해도 같은 지점의 모든 PC에서 보인다 (2026-09-07 승격).
// 예전 PC별 localStorage 값은 첫 조회 시 한 번 이관된다.
import { getPreference, setPreference, migrateLegacyPreference } from './shopPreferences';
import type { PrefLanded } from './prefLandedRule';

const BASE_PAYMENT_METHODS = ['카드', '현금', '계좌이체', '카카오페이'] as const;

const LEGACY_STORAGE_KEY = 'crm_custom_payment_methods';

function sanitize(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
}

export function getCustomPaymentMethods(): string[] {
  const migrated = migrateLegacyPreference('customPaymentMethods', LEGACY_STORAGE_KEY, raw => {
    try { const parsed = sanitize(JSON.parse(raw)); return parsed.length > 0 ? parsed : null; } catch { return null; }
  });
  return sanitize(migrated ?? getPreference('customPaymentMethods'));
}

export function getAllPaymentMethods(): string[] {
  const custom = getCustomPaymentMethods();
  return [...BASE_PAYMENT_METHODS, ...custom.filter(c => !(BASE_PAYMENT_METHODS as readonly string[]).includes(c))];
}

/**
 * 커스텀 결제수단 추가.
 * @returns `'invalid'` = 중복·빈값·20자 초과(아무것도 바꾸지 않았다), 그 밖은 **이 PC 에 남았는지** 판정 (296).
 * 전에는 `boolean` 이라 "쓸 수 없는 이름" 과 "저장 실패" 가 같은 답이었고, 저장 실패는 아예 알 수 없었다.
 */
export function addCustomPaymentMethod(name: string): 'invalid' | PrefLanded {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 20) return 'invalid';
  if (getAllPaymentMethods().includes(trimmed) || trimmed === '혼합') return 'invalid';
  try {
    return setPreference('customPaymentMethods', [...getCustomPaymentMethods(), trimmed]);
  } catch {
    return 'lost';
  }
}

export function removeCustomPaymentMethod(name: string): PrefLanded {
  return setPreference('customPaymentMethods', getCustomPaymentMethods().filter(m => m !== name));
}
