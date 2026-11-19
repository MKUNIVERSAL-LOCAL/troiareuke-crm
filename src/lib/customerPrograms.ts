// ═══════════════════════════════════════════════════════════════
// customerPrograms — 회차 차감에 쓸 수 있는 프로그램 (비코어, 2026-11-19)
// ───────────────────────────────────────────────────────────────
// 코어 CustomerProgramStore.getActive는 '완료되지 않은 것'만 거른다. 만료일이 지난 회차권도 그대로 돌아와 시술 기록에서
// 회차가 차감되던 공백을 코어 밖에서 막는다. 만료된 회차권은 고객 상세 > [관리]에서 만료일을 연장한 뒤에만 다시 쓸 수 있다.
// ═══════════════════════════════════════════════════════════════

import { CustomerProgramStore } from './store';
import { todayISO } from './format';
import type { CustomerProgram } from '../types';

/** 만료일이 지났는가 (만료일 없음 = 만료 안 됨). 화면 배지·차감 가능 여부가 같은 기준을 쓰도록 한 곳에 둔다 */
export function isProgramExpired(cp: CustomerProgram, today = todayISO()): boolean {
  return !!cp.expiryDate && cp.expiryDate < today;
}

/** 회차 차감에 쓸 수 있는 프로그램 — 미완료이고 만료일이 지나지 않은 것 */
export function getUsablePrograms(customerId: string): CustomerProgram[] {
  const today = todayISO();
  return CustomerProgramStore.getActive(customerId).filter(cp => !isProgramExpired(cp, today));
}

/** 미완료인데 만료일이 지난 프로그램 — "연장 후 사용" 안내용 */
export function getExpiredPrograms(customerId: string): CustomerProgram[] {
  const today = todayISO();
  return CustomerProgramStore.getActive(customerId).filter(cp => isProgramExpired(cp, today));
}

/** 시술 기록 창의 만료 안내 문구 */
export function expiredProgramsHint(expired: CustomerProgram[]): string {
  return `만료된 회차권(${expired.map(cp => cp.programName).join(', ')})은 차감할 수 없습니다. 고객 상세의 [관리]에서 만료일을 연장하면 다시 선택할 수 있습니다.`;
}
