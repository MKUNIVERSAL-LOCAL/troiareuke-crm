// 결제수단 공용 목록 — 기본 4종 + 매장에서 직접 추가한 커스텀 수단.
// 커스텀 수단은 이 기기의 localStorage에 저장된다(기기별). 서버 동기화 대상 아님.
export const BASE_PAYMENT_METHODS = ['카드', '현금', '계좌이체', '카카오페이'] as const;

const STORAGE_KEY = 'crm_custom_payment_methods';

export function getCustomPaymentMethods(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string' && v.trim()) : [];
  } catch {
    return [];
  }
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
  const next = [...getCustomPaymentMethods(), trimmed];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return true;
}

export function removeCustomPaymentMethod(name: string): void {
  const next = getCustomPaymentMethods().filter(m => m !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
