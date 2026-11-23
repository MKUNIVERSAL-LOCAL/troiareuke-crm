import type { Customer } from '../types';

/** 집계 대상 고객 — 샘플 데이터·익명화(탈퇴) 고객 제외. 대시보드 전체/신규/VIP·생일·리마인더가 같은 규칙을 쓴다 (10차 숫자 점검 #M7, 2026-11-20) */
export function isCountableCustomer(c: Pick<Customer, 'id' | 'isActive'>): boolean {
  return !c.id.startsWith('sample_') && c.isActive !== false;
}
