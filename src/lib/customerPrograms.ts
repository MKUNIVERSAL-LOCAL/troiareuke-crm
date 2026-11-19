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

/** 기준일 — 시술일(YYYY-MM-DD)이 온전하면 그 날, 아니면 오늘. 만료 다음 날 어제 방문을 뒤늦게 적는 정상 업무를 막지 않기 위해 시술일 기준으로 판단한다 (리뷰 2026-11-19) */
function asOfDate(asOf?: string): string {
  return asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : todayISO();
}

/** 회차 차감에 쓸 수 있는 프로그램 — 미완료이고 기준일(시술일) 현재 만료되지 않은 것 */
export function getUsablePrograms(customerId: string, asOf?: string): CustomerProgram[] {
  const day = asOfDate(asOf);
  return CustomerProgramStore.getActive(customerId).filter(cp => !isProgramExpired(cp, day));
}

/** 미완료인데 기준일(시술일) 현재 만료된 프로그램 — "연장 후 사용" 안내용 */
export function getExpiredPrograms(customerId: string, asOf?: string): CustomerProgram[] {
  const day = asOfDate(asOf);
  return CustomerProgramStore.getActive(customerId).filter(cp => isProgramExpired(cp, day));
}

/** 시술 기록 창의 만료 안내 문구. where = 연장하는 곳(화면에 따라 다르게) */
export function expiredProgramsHint(expired: CustomerProgram[], where = '고객 상세의 [관리]'): string {
  return `시술일 기준으로 만료된 회차권(${expired.map(cp => cp.programName).join(', ')})은 차감할 수 없습니다. ${where}에서 만료일을 연장하면 다시 선택할 수 있습니다.`;
}

/** 저장 직전 방어 — 선택지에 없는 프로그램 id가 상태에 남아 있으면(시술일 변경·만료) 조용히 차감하지 않는다 */
export const EXPIRED_LINK_BLOCKED = '선택한 회차권은 시술일 기준으로 만료됐거나 완료돼 차감할 수 없습니다. 시술일을 확인하거나 [관리]에서 만료일을 연장해주세요.';
