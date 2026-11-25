// customerHistory — 고객 정보 변경 이력 저장 (비코어, 252)
// 저장 위치: **이 기기 localStorage** `crm_<shop>_customer_history`(247 예약 이력과 같은 방식).
//   설정 행에 두면 고객을 저장할 때마다 preferences 전체가 서버로 올라가 다른 PC 의 설정을 덮는다(246 리뷰 H-1).
//   지점 공용 이력은 서버 컬렉션 승인(B-2/S-7) 뒤 — 승인 큐 25 와 함께 처리한다.
// 규칙은 customerHistoryRule.ts(순수). 여기서는 저장·읽기·정리만 한다.
import { getShopId, safeSetItem } from './store';
import { todayISO } from './format';
import {
  sanitizeCustomerHistory, trimCustomerHistory, customerHistoryFor, diffCustomer, gradeChange,
  type CustomerHistoryEntry, type CustomerHistoryKind, type CustomerSnapshot, type CustomerChange,
} from './customerHistoryRule';

const KEEP_DAYS = 180;
const KEY = () => `crm_${getShopId()}_customer_history`;

function keepFrom(): string {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() - KEEP_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read(): CustomerHistoryEntry[] {
  try {
    return sanitizeCustomerHistory(JSON.parse(localStorage.getItem(KEY()) || '[]'));
  } catch {
    return [];
  }
}

function genId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function record(customerId: string, kind: CustomerHistoryKind, changes: CustomerChange[], actor?: string): void {
  if (changes.length === 0 && kind !== 'delete') return;
  try {
    safeSetItem(KEY(), JSON.stringify(trimCustomerHistory([...read(), {
      id: genId(), customerId, at: new Date().toISOString(), kind, ...(actor ? { actor } : {}), changes,
    }], keepFrom())));
  } catch {
    /* 이력 저장 실패가 고객 저장을 되돌리게 하지 않는다 */
  }
}

/** 고객 정보를 고쳤다 — 저장 전/후를 비교해 바뀐 항목만 남긴다 */
export function logCustomerEdit(customerId: string, before: CustomerSnapshot, after: CustomerSnapshot, actor?: string): void {
  record(customerId, 'edit', diffCustomer(before, after), actor);
}

/** 등급만 바꿨다(뱃지 드롭다운·등급 제안 일괄 적용) */
export function logCustomerGrade(customerId: string, from: string | undefined, to: string, actor?: string): void {
  record(customerId, 'grade', gradeChange(from, to), actor);
}

/** 그 고객의 이력(최근 것이 위로) */
export function customerHistory(customerId: string): CustomerHistoryEntry[] {
  return customerHistoryFor(read(), customerId);
}

/**
 * 익명화·삭제 때 그 고객 이력을 지운다 — 이력에 남은 이름·태그도 개인정보다 (250 리뷰 H-4 와 같은 짝).
 * @returns 지운 건수
 */
export function clearCustomerHistory(customerId: string): number {
  try {
    const all = read();
    const next = all.filter(e => e.customerId !== customerId);
    if (next.length === all.length) return 0;
    safeSetItem(KEY(), JSON.stringify(next));
    return all.length - next.length;
  } catch {
    return 0;
  }
}
