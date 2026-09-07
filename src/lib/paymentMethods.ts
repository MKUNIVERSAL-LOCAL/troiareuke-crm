// 결제수단 공용 목록 — 기본 4종 + 매장에서 직접 추가한 커스텀 수단.
// 커스텀 수단은 지점 환경설정(shop_settings.preferences.customPaymentMethods)에 저장되어
// NAS로 동기화된다 — 어느 PC에서 추가해도 같은 지점의 모든 PC에서 보인다 (2026-09-07 승격).
// 예전 PC별 localStorage 값은 첫 조회 시 한 번 이관된다.
import { getPreference, setPreference, migrateLegacyPreference } from './shopPreferences';

export const BASE_PAYMENT_METHODS = ['카드', '현금', '계좌이체', '카카오페이'] as const;

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

/** 커스텀 결제수단 추가. 성공 시 true, 중복/빈값이면 false */
export function addCustomPaymentMethod(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 20) return false;
  if (getAllPaymentMethods().includes(trimmed) || trimmed === '혼합') return false;
  try {
    setPreference('customPaymentMethods', [...getCustomPaymentMethods(), trimmed]);
  } catch {
    return false;
  }
  return true;
}

export function removeCustomPaymentMethod(name: string): void {
  setPreference('customPaymentMethods', getCustomPaymentMethods().filter(m => m !== name));
}
